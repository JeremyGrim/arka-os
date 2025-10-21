import { EventEmitter } from 'events';
import { ModuleManager } from '../core/moduleManager';
import { LogService } from '../services/logService';
import { ProviderMetricsService } from '../services/providerMetricsService';
import {
  LoadBalancingStrategy,
  RouterCacheStats,
  RouterModuleInstance,
  RouterModuleMetrics,
  RouterQueueStatus,
  RouterQueuedRequest,
  RouterStatus,
  RouterStrategy,
  RouterStrategyConfig,
  RoutingStrategy
} from '../types';

interface CacheEntry {
  key: string;
  value: unknown;
  expiresAt: number;
}

type DispatchResult = {
  moduleId: string;
  fromFallback: boolean;
};

const DEFAULT_CACHE_TTL = 60_000;
const DEFAULT_CACHE_MAX = 100;
const DEFAULT_QUEUE_TIMEOUT = 30_000;

export class RouterService {
  private readonly configs = new Map<string, RouterStrategyConfig>();
  private readonly caches = new Map<string, Map<string, CacheEntry>>();
  private readonly eventBus = new EventEmitter();
  private cacheEnabled = false;
  private readonly stickySessions = new Map<string, string>();
  private readonly queueStats: RouterQueueStatus = {
    size: 0,
    processing: 0,
    waiting: 0,
    dropped: 0,
    priority: 'fifo',
    timeout: DEFAULT_QUEUE_TIMEOUT
  };

  constructor(
    private readonly moduleManager: ModuleManager,
    private readonly logService: LogService,
    private readonly providerMetrics?: ProviderMetricsService
  ) {}

  setStrategy(moduleId: string, strategy: RouterStrategy, targets: string[], weights?: Record<string, number>): void {
    const config = this.getOrCreateConfig(moduleId, targets);
    config.strategy = strategy;
    config.loadBalancing = this.asLoadBalancing(strategy, config.loadBalancing ?? 'round_robin');
    config.routingMode = this.asRoutingMode(strategy, config.routingMode ?? 'round_robin');
    config.targets = targets.length > 0 ? targets : config.targets;
    config.weights = weights ?? config.weights;
    config.metrics = this.ensureMetrics(config.targets, config.metrics);
    config.lastRoutedIndex = 0;
    this.configs.set(moduleId, config);
  }

  setLoadBalancingStrategy(moduleId: string, strategy: LoadBalancingStrategy): void {
    const config = this.getOrCreateConfig(moduleId);
    config.loadBalancing = strategy;
    config.strategy = strategy;
    this.configs.set(moduleId, config);
  }

  setRoutingStrategy(moduleId: string, strategy: RoutingStrategy): void {
    const config = this.getOrCreateConfig(moduleId);
    config.routingMode = strategy;
    this.configs.set(moduleId, config);
  }

  registerTargets(moduleId: string, targets: string[]): void {
    const config = this.getOrCreateConfig(moduleId, targets);
    config.targets = targets;
    config.metrics = this.ensureMetrics(targets, config.metrics);
    this.configs.set(moduleId, config);
  }

  setActiveTarget(moduleId: string, targetId: string): void {
    const config = this.getOrCreateConfig(moduleId, [targetId]);
    if (!config.targets.includes(targetId)) {
      config.targets.push(targetId);
      config.metrics = this.ensureMetrics(config.targets, config.metrics);
    }
    config.lastRoutedIndex = config.targets.indexOf(targetId);
    this.configs.set(moduleId, config);
    this.logService.info(`Router active target for ${moduleId} -> ${targetId}`, 'router');
  }

  registerInstance(moduleId: string, instance: RouterModuleInstance): void {
    const config = this.getOrCreateConfig(moduleId, [instance.id]);
    config.instances[instance.id] = {
      ...instance,
      registeredAt: instance.registeredAt ?? new Date().toISOString()
    };
    if (!config.targets.includes(instance.id)) {
      config.targets.push(instance.id);
    }
    config.metrics = this.ensureMetrics(config.targets, config.metrics);
    this.configs.set(moduleId, config);
    this.logService.info(`Router instance registered for ${moduleId}: ${instance.id}`, 'router');
  }

  unregisterInstance(moduleId: string, instanceId: string): void {
    const config = this.getOrCreateConfig(moduleId);
    delete config.instances[instanceId];
    config.targets = config.targets.filter((target) => target !== instanceId);
    delete config.metrics[instanceId];
    this.configs.set(moduleId, config);
  }

  updateCacheConfig(options: { enabled: boolean; ttl: number; maxSize?: number; strategy?: 'lru' | 'lfu' | 'fifo' }): void {
    this.cacheEnabled = options.enabled;
    for (const config of this.configs.values()) {
      config.useCache = options.enabled;
      config.cacheTtl = options.ttl;
      if (options.maxSize !== undefined) {
        config.cacheMaxSize = options.maxSize;
      }
      if (options.strategy) {
        config.cacheStrategy = options.strategy;
      }
    }
  }

  enableCache(moduleId: string, configInput: { enabled: boolean; ttl: number; maxSize: number; strategy: 'lru' | 'lfu' | 'fifo' }): void {
    const config = this.getOrCreateConfig(moduleId);
    config.useCache = configInput.enabled;
    config.cacheTtl = configInput.ttl;
    config.cacheMaxSize = configInput.maxSize;
    config.cacheStrategy = configInput.strategy;
    this.cacheEnabled = this.cacheEnabled || configInput.enabled;
    this.configs.set(moduleId, config);
  }

  invalidateCache(moduleId: string, pattern?: string): void {
    const cache = this.caches.get(moduleId);
    if (!cache) {
      return;
    }
    if (!pattern) {
      cache.clear();
      return;
    }
    const regex = new RegExp(pattern);
    for (const key of Array.from(cache.keys())) {
      if (regex.test(key)) {
        cache.delete(key);
      }
    }
  }

  getCacheStats(moduleId?: string): RouterCacheStats {
    if (moduleId) {
      const config = this.getOrCreateConfig(moduleId);
      return { ...config.cacheStats };
    }
    const aggregate: RouterCacheStats = { hits: 0, misses: 0, hitRate: 0, size: 0, evictions: 0 };
    for (const config of this.configs.values()) {
      aggregate.hits += config.cacheStats.hits;
      aggregate.misses += config.cacheStats.misses;
      aggregate.size += config.cacheStats.size;
      aggregate.evictions += config.cacheStats.evictions;
    }
    const total = aggregate.hits + aggregate.misses;
    aggregate.hitRate = total === 0 ? 0 : Number((aggregate.hits / total).toFixed(2));
    return aggregate;
  }

  updateQueueConfig(moduleId: string, options: { enabled: boolean; maxQueue: number; priority?: 'fifo' | 'lifo' | 'priority'; timeout?: number }): void {
    const config = this.getOrCreateConfig(moduleId);
    config.queueEnabled = options.enabled;
    config.maxQueue = options.maxQueue;
    if (options.priority) {
      config.queuePriority = options.priority;
    }
    if (options.timeout !== undefined) {
      config.queueTimeout = options.timeout;
    }
    this.queueStats.priority = config.queuePriority;
    this.queueStats.timeout = config.queueTimeout;
    this.configs.set(moduleId, config);
  }

  getQueueStatus(moduleId?: string): RouterQueueStatus {
    if (moduleId) {
      const config = this.getOrCreateConfig(moduleId);
      return {
        size: config.queue.length,
        processing: this.queueStats.processing,
        waiting: Math.max(0, config.queue.length - this.queueStats.processing),
        dropped: this.queueStats.dropped,
        priority: config.queuePriority,
        timeout: config.queueTimeout
      };
    }
    return { ...this.queueStats };
  }

  prioritizeRequest(moduleId: string, requestId: string): void {
    const config = this.getOrCreateConfig(moduleId);
    const index = config.queue.findIndex((item) => item.id === requestId);
    if (index > 0) {
      const [item] = config.queue.splice(index, 1);
      config.queue.unshift(item);
    }
  }

  dispatch(moduleId: string, requestPayload?: any): DispatchResult {
    const config = this.getOrCreateConfig(moduleId);

    if (config.queueEnabled) {
      const request: RouterQueuedRequest = {
        id: requestPayload?.requestId ?? `req-${Date.now()}`,
        priority: requestPayload?.priority ?? 0,
        enqueuedAt: new Date().toISOString(),
        payload: requestPayload
      };
      config.queue.push(request);
      if (config.queue.length > config.maxQueue) {
        config.queue.shift();
        this.queueStats.dropped += 1;
      }
      this.queueStats.size = config.queue.length;
    }

    const target = this.selectTarget(config, requestPayload);
    this.updateMetrics(config, target, requestPayload);
    this.applyStickySession(config, target, requestPayload);
    this.applyQueueAfterDispatch(config);
    this.trackProviderMetrics(target, requestPayload);

    if (config.useCache && this.cacheEnabled && requestPayload) {
      const cacheKey = requestPayload.cacheKey ?? target;
      this.storeInCache(moduleId, cacheKey, requestPayload.result ?? requestPayload);
    }

    this.eventBus.emit('dispatch', { moduleId, target });
    return { moduleId: target, fromFallback: target !== moduleId };
  }

  getStatus(): RouterStatus {
    const modules: Record<string, RouterStrategyConfig> = {};
    for (const [moduleId, config] of this.configs.entries()) {
      modules[moduleId] = config;
    }
    return {
      modules,
      cache: {
        enabled: this.cacheEnabled,
        entries: Array.from(this.caches.values()).reduce((acc, map) => acc + map.size, 0),
        stats: this.getCacheStats()
      },
      queue: { ...this.queueStats }
    };
  }

  onDispatch(listener: (payload: { moduleId: string; target: string }) => void): void {
    this.eventBus.on('dispatch', listener);
  }

  getCacheEntry(moduleId: string, key: string): unknown | undefined {
    const cache = this.caches.get(moduleId);
    if (!cache) {
      return undefined;
    }
    const entry = cache.get(key);
    if (!entry) {
      this.bumpCacheStats(moduleId, 'miss');
      return undefined;
    }
    if (entry.expiresAt < Date.now()) {
      cache.delete(key);
      this.bumpCacheStats(moduleId, 'miss');
      return undefined;
    }
    this.bumpCacheStats(moduleId, 'hit');
    return entry.value;
  }

  getLoadMetrics(moduleId: string): RouterModuleMetrics {
    const config = this.getOrCreateConfig(moduleId);
    const metrics = Object.values(config.metrics);
    const aggregate: RouterModuleMetrics = {
      calls: metrics.reduce((acc, metric) => acc + metric.calls, 0),
      averageLatencyMs: this.computeAverageLatency(config),
      lastRoutedAt: metrics.sort((a, b) => (b.lastRoutedAt ?? '').localeCompare(a.lastRoutedAt ?? ''))[0]?.lastRoutedAt,
      activeConnections: metrics.reduce((acc, metric) => acc + (metric.activeConnections ?? 0), 0),
      requestsPerSecond: metrics.reduce((acc, metric) => acc + (metric.requestsPerSecond ?? 0), 0),
      errorRate: metrics.reduce((acc, metric) => acc + (metric.errorRate ?? 0), 0)
    };
    return aggregate;
  }

  private getOrCreateConfig(moduleId: string, targets: string[] = [moduleId]): RouterStrategyConfig {
    const existing = this.configs.get(moduleId);
    if (existing) {
      return existing;
    }
    const metrics = this.ensureMetrics(targets);
    const config: RouterStrategyConfig = {
      strategy: 'round_robin',
      targets,
      weights: {},
      useCache: this.cacheEnabled,
      cacheTtl: DEFAULT_CACHE_TTL,
      cacheMaxSize: DEFAULT_CACHE_MAX,
      cacheStrategy: 'lru',
      cacheStats: { hits: 0, misses: 0, hitRate: 0, size: 0, evictions: 0 },
      queueEnabled: false,
      queuePriority: 'fifo',
      queueTimeout: DEFAULT_QUEUE_TIMEOUT,
      maxQueue: 100,
      queue: [],
      lastRoutedIndex: 0,
      metrics,
      instances: {},
      loadBalancing: 'round_robin',
      routingMode: 'round_robin'
    };
    this.configs.set(moduleId, config);
    return config;
  }

  private ensureMetrics(targets: string[], prev: Record<string, RouterModuleMetrics> = {}): Record<string, RouterModuleMetrics> {
    const metrics: Record<string, RouterModuleMetrics> = { ...prev };
    targets.forEach((target) => {
      if (!metrics[target]) {
        metrics[target] = {
          calls: 0,
          averageLatencyMs: 0
        };
      }
    });
    return metrics;
  }

  private asLoadBalancing(strategy: RouterStrategy, fallback: LoadBalancingStrategy): LoadBalancingStrategy {
    const lb: LoadBalancingStrategy[] = ['round_robin', 'least_loaded', 'least_connections', 'least_response_time', 'weighted', 'ip_hash'];
    return lb.includes(strategy as LoadBalancingStrategy) ? (strategy as LoadBalancingStrategy) : fallback;
  }

  private asRoutingMode(strategy: RouterStrategy, fallback: RoutingStrategy): RoutingStrategy {
    const routing: RoutingStrategy[] = ['round_robin', 'priority', 'sticky_session', 'content_based', 'geo_aware', 'failover'];
    return routing.includes(strategy as RoutingStrategy) ? (strategy as RoutingStrategy) : fallback;
  }

  private selectTarget(config: RouterStrategyConfig, payload: any): string {
    if (config.targets.length === 0) {
      config.targets = ['default'];
    }
    switch (config.strategy) {
      case 'least_connections':
        return this.leastByMetric(config, 'activeConnections');
      case 'least_response_time':
        return this.leastByMetric(config, 'averageLatencyMs');
      case 'weighted':
        return this.weighted(config);
      case 'ip_hash':
        return this.ipHash(config, payload?.ipAddress ?? payload?.ip);
      case 'priority':
        return this.priority(config);
      case 'sticky_session':
        return this.sticky(config, payload?.sessionId);
      case 'content_based':
        return this.contentBased(config, payload?.contentKey ?? payload?.operationKey);
      case 'geo_aware':
        return this.geoAware(config, payload?.region ?? payload?.countryCode);
      case 'least_loaded':
        return this.leastByMetric(config, 'calls');
      case 'round_robin':
      default:
        return this.roundRobin(config);
    }
  }

  private roundRobin(config: RouterStrategyConfig): string {
    const index = config.lastRoutedIndex % config.targets.length;
    config.lastRoutedIndex = (index + 1) % config.targets.length;
    return config.targets[index];
  }

  private leastByMetric(config: RouterStrategyConfig, metric: keyof RouterModuleMetrics): string {
    const entries = Object.entries(config.metrics);
    entries.sort((a, b) => ((a[1][metric] ?? 0) as number) - ((b[1][metric] ?? 0) as number));
    const candidate = entries[0]?.[0] ?? config.targets[0];
    config.lastRoutedIndex = config.targets.indexOf(candidate);
    return candidate;
  }

  private weighted(config: RouterStrategyConfig): string {
    const weights = config.weights;
    if (!weights || Object.keys(weights).length === 0) {
      return this.roundRobin(config);
    }
    const pool: string[] = [];
    config.targets.forEach((target) => {
      const weight = Math.max(1, Math.floor(weights[target] ?? 1));
      for (let i = 0; i < weight; i += 1) {
        pool.push(target);
      }
    });
    if (pool.length === 0) {
      return config.targets[0];
    }
    const index = config.lastRoutedIndex % pool.length;
    config.lastRoutedIndex = (index + 1) % pool.length;
    return pool[index];
  }

  private ipHash(config: RouterStrategyConfig, ip?: string): string {
    if (!ip) {
      return this.roundRobin(config);
    }
    const hash = ip.split('.').reduce((acc, part) => acc + Number(part), 0);
    const index = hash % config.targets.length;
    config.lastRoutedIndex = index;
    return config.targets[index];
  }

  private priority(config: RouterStrategyConfig): string {
    if (Object.keys(config.weights).length === 0) {
      return config.targets[0];
    }
    const sorted = [...config.targets].sort((a, b) => (config.weights[b] ?? 0) - (config.weights[a] ?? 0));
    return sorted[0];
  }

  private sticky(config: RouterStrategyConfig, sessionId?: string): string {
    if (!sessionId) {
      return this.roundRobin(config);
    }
    const existing = this.stickySessions.get(sessionId);
    if (existing && config.targets.includes(existing)) {
      return existing;
    }
    const target = this.roundRobin(config);
    this.stickySessions.set(sessionId, target);
    return target;
  }

  private contentBased(config: RouterStrategyConfig, key?: string): string {
    if (!key) {
      return this.roundRobin(config);
    }
    const hash = Array.from(key).reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const index = hash % config.targets.length;
    config.lastRoutedIndex = index;
    return config.targets[index];
  }

  private geoAware(config: RouterStrategyConfig, region?: string): string {
    if (!region) {
      return this.roundRobin(config);
    }
    const normalized = region.toLowerCase();
    const match = config.targets.find((target) => target.toLowerCase().includes(normalized));
    return match ?? this.roundRobin(config);
  }

  private updateMetrics(config: RouterStrategyConfig, target: string, payload: any): void {
    const metrics = config.metrics[target] ?? { calls: 0, averageLatencyMs: 0 };
    metrics.calls += 1;
    metrics.lastRoutedAt = new Date().toISOString();
    if (payload?.latencyMs) {
      metrics.averageLatencyMs = Number(((metrics.averageLatencyMs + payload.latencyMs) / 2).toFixed(2));
    }
    if (payload?.activeConnections !== undefined) {
      metrics.activeConnections = payload.activeConnections;
    }
    if (payload?.requestsPerSecond !== undefined) {
      metrics.requestsPerSecond = payload.requestsPerSecond;
    }
    if (payload?.errorRate !== undefined) {
      metrics.errorRate = payload.errorRate;
      metrics.lastErrorAt = payload.errorRate > 0 ? new Date().toISOString() : metrics.lastErrorAt;
    }
    config.metrics[target] = metrics;
  }

  private applyStickySession(config: RouterStrategyConfig, target: string, payload: any): void {
    if (config.routingMode === 'sticky_session' && payload?.sessionId) {
      this.stickySessions.set(payload.sessionId, target);
    }
  }

  private applyQueueAfterDispatch(config: RouterStrategyConfig): void {
    if (!config.queueEnabled) {
      return;
    }
    if (config.queue.length > 0) {
      config.queue.shift();
      this.queueStats.processing = Math.max(0, this.queueStats.processing - 1);
      this.queueStats.size = config.queue.length;
      this.queueStats.waiting = Math.max(0, config.queue.length - this.queueStats.processing);
    }
  }

  private storeInCache(moduleId: string, key: string, value: unknown): void {
    const config = this.getOrCreateConfig(moduleId);
    if (!config.useCache) {
      return;
    }
    const cache = this.caches.get(moduleId) ?? new Map<string, CacheEntry>();
    if (cache.size >= config.cacheMaxSize) {
      const firstKey = cache.keys().next().value as string | undefined;
      if (firstKey) {
        cache.delete(firstKey);
        config.cacheStats.evictions += 1;
      }
    }
    cache.set(key, {
      key,
      value,
      expiresAt: Date.now() + config.cacheTtl
    });
    config.cacheStats.size = cache.size;
    this.caches.set(moduleId, cache);
  }

  private bumpCacheStats(moduleId: string, kind: 'hit' | 'miss'): void {
    const config = this.getOrCreateConfig(moduleId);
    if (kind === 'hit') {
      config.cacheStats.hits += 1;
    } else {
      config.cacheStats.misses += 1;
    }
    const total = config.cacheStats.hits + config.cacheStats.misses;
    config.cacheStats.hitRate = total === 0 ? 0 : Number((config.cacheStats.hits / total).toFixed(2));
  }

  private computeAverageLatency(config: RouterStrategyConfig): number {
    const values = Object.values(config.metrics).map((metric) => metric.averageLatencyMs ?? 0);
    if (values.length === 0) {
      return 0;
    }
    const sum = values.reduce((acc, value) => acc + value, 0);
    return Number((sum / values.length).toFixed(2));
  }

  private trackProviderMetrics(providerId: string, payload?: any): void {
    if (!this.providerMetrics) {
      return;
    }
    const latencyCandidate = payload?.latencyMs;
    const latencyMs = typeof latencyCandidate === 'number' && !Number.isNaN(latencyCandidate) ? latencyCandidate : undefined;
    const sessionId =
      typeof payload?.sessionId === 'string'
        ? payload.sessionId
        : typeof payload?.context?.sessionId === 'string'
          ? payload.context.sessionId
          : undefined;

    this.providerMetrics.recordDispatch({
      providerId,
      sessionId,
      latencyMs
    });
  }
}

