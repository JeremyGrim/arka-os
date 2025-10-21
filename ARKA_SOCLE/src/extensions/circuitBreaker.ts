import { EventEmitter } from 'events';
import { FallbackEngine } from './fallbackEngine';
import { LogService } from '../services/logService';
import { CircuitConfig, CircuitMetrics, CircuitState, CircuitStatus, CircuitStatusItem } from '../types';

interface CircuitEntry {
  moduleId: string;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  openedAt?: number;
  lastError?: string;
  lastFailure?: number;
  lastSuccess?: number;
  nextAttempt?: number;
  config: CircuitConfig;
  metrics: CircuitMetrics;
}

const DEFAULT_CONFIG: CircuitConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeoutMs: 60_000,
  halfOpenTimeout: 10_000,
  resetTimeout: 120_000
};

export class CircuitBreakerService {
  private readonly circuits = new Map<string, CircuitEntry>();
  private readonly events = new EventEmitter();

  constructor(private readonly fallbackEngine: FallbackEngine, private readonly logService: LogService) {}

  configure(moduleId: string, config: Partial<CircuitConfig>): CircuitEntry {
    const entry = this.ensureEntry(moduleId);
    entry.config = {
      failureThreshold: config.failureThreshold ?? entry.config.failureThreshold,
      successThreshold: config.successThreshold ?? entry.config.successThreshold,
      timeoutMs: config.timeoutMs ?? entry.config.timeoutMs,
      halfOpenTimeout: config.halfOpenTimeout ?? entry.config.halfOpenTimeout,
      resetTimeout: config.resetTimeout ?? entry.config.resetTimeout
    };
    this.circuits.set(moduleId, entry);
    return entry;
  }

  getConfig(moduleId: string): CircuitConfig {
    return { ...this.ensureEntry(moduleId).config };
  }

  getState(moduleId: string): CircuitState {
    return this.ensureEntry(moduleId).state;
  }

  recordFailure(moduleId: string, reason: string): void {
    const entry = this.ensureEntry(moduleId);
    entry.failureCount += 1;
    entry.lastError = reason;
    entry.lastFailure = Date.now();
    entry.metrics.failures = entry.failureCount;
    entry.metrics.lastFailure = new Date(entry.lastFailure).toISOString();

    if (entry.state === 'open') {
      this.logService.warn(`Circuit ${moduleId} already open - failure ignored`, 'circuit');
      return;
    }

    if (entry.failureCount >= entry.config.failureThreshold) {
      this.open(moduleId, reason);
    } else {
      this.logService.warn(`Circuit ${moduleId} failure ${entry.failureCount}/${entry.config.failureThreshold}`, 'circuit');
    }
  }

  recordSuccess(moduleId: string): void {
    const entry = this.ensureEntry(moduleId);
    entry.successCount += 1;
    entry.lastSuccess = Date.now();
    entry.metrics.successes = entry.successCount;
    entry.metrics.lastSuccess = new Date(entry.lastSuccess).toISOString();

    if (entry.state === 'half-open' && entry.successCount >= entry.config.successThreshold) {
      this.close(moduleId);
    }
  }

  open(moduleId: string, reason: string): void {
    const entry = this.ensureEntry(moduleId);
    const oldState = entry.state;
    entry.state = 'open';
    entry.openedAt = Date.now();
    entry.failureCount = 0;
    entry.successCount = 0;
    entry.lastError = reason;
    entry.metrics.state = 'open';
    entry.metrics.openedAt = new Date(entry.openedAt).toISOString();
    entry.metrics.nextAttempt = new Date(entry.openedAt + (entry.config.timeoutMs ?? DEFAULT_CONFIG.timeoutMs)).toISOString();
    this.logService.warn(`Circuit opened for ${moduleId}: ${reason}`, 'circuit');
    void this.fallbackEngine.triggerFallback(moduleId, `circuit-open: ${reason}`);
    this.events.emit('open', { moduleId, oldState, newState: 'open', reason, timestamp: new Date().toISOString() });
  }

  close(moduleId: string): void {
    const entry = this.ensureEntry(moduleId);
    const oldState = entry.state;
    entry.state = 'closed';
    entry.failureCount = 0;
    entry.successCount = 0;
    entry.openedAt = undefined;
    entry.lastError = undefined;
    entry.metrics = {
      ...entry.metrics,
      state: 'closed',
      nextAttempt: undefined,
      openedAt: undefined
    };
    this.logService.info(`Circuit closed for ${moduleId}`, 'circuit');
    void this.fallbackEngine.revertToPrimary(moduleId);
    this.events.emit('close', { moduleId, oldState, newState: 'closed', reason: 'manual-close', timestamp: new Date().toISOString() });
  }

  halfOpen(moduleId: string): void {
    const entry = this.ensureEntry(moduleId);
    const oldState = entry.state;
    entry.state = 'half-open';
    entry.failureCount = 0;
    entry.successCount = 0;
    entry.metrics.state = 'half-open';
    entry.metrics.nextAttempt = undefined;
    this.logService.info(`Circuit half-open for ${moduleId}`, 'circuit');
    this.events.emit('half-open', { moduleId, oldState, newState: 'half-open', reason: 'timeout', timestamp: new Date().toISOString() });
  }

  reset(moduleId: string): void {
    const entry = this.ensureEntry(moduleId);
    entry.state = 'closed';
    entry.failureCount = 0;
    entry.successCount = 0;
    entry.lastError = undefined;
    entry.openedAt = undefined;
    entry.metrics = {
      state: 'closed',
      failures: 0,
      successes: 0
    };
  }

  forceReset(moduleId: string): void {
    this.reset(moduleId);
    this.logService.info(`Circuit forcibly reset for ${moduleId}`, 'circuit');
  }

  evaluateTimeouts(): void {
    const now = Date.now();
    this.circuits.forEach((entry, moduleId) => {
      if (entry.state === 'open' && entry.openedAt && now - entry.openedAt >= (entry.config.timeoutMs ?? DEFAULT_CONFIG.timeoutMs)) {
        this.halfOpen(moduleId);
        entry.nextAttempt = now + (entry.config.halfOpenTimeout ?? DEFAULT_CONFIG.halfOpenTimeout!);
      }
      if (entry.state !== 'open' && entry.config.resetTimeout && entry.lastFailure && now - entry.lastFailure >= entry.config.resetTimeout) {
        this.reset(moduleId);
      }
    });
  }

  getMetrics(moduleId: string): CircuitMetrics {
    return { ...this.ensureEntry(moduleId).metrics };
  }

  async testConnection(moduleId: string): Promise<boolean> {
    try {
      const route = this.fallbackEngine.getCurrentRoute(moduleId);
      this.logService.debug(`Testing connection for ${moduleId} via ${route.currentModuleId}`, 'circuit');
      // Placeholder: in a real scenario we would ping the module.
      return Promise.resolve(true);
    } catch (error) {
      this.logService.error(`Connection test failed for ${moduleId}: ${(error as Error).message}`, 'circuit');
      return false;
    }
  }

  getStatus(): CircuitStatus {
    const modules: CircuitStatusItem[] = [];
    this.circuits.forEach((entry, moduleId) => {
      modules.push({
        moduleId,
        state: entry.state,
        failureCount: entry.failureCount,
        successCount: entry.successCount,
        openedAt: entry.openedAt ? new Date(entry.openedAt).toISOString() : undefined,
        lastError: entry.lastError,
        config: entry.config,
        metrics: { ...entry.metrics }
      });
    });
    return { modules };
  }

  on(event: 'open' | 'close' | 'half-open', listener: (payload: Record<string, unknown>) => void): () => void {
    this.events.on(event, listener);
    return () => {
      this.events.off(event, listener);
    };
  }

  private ensureEntry(moduleId: string): CircuitEntry {
    const existing = this.circuits.get(moduleId);
    if (existing) {
      return existing;
    }
    const entry: CircuitEntry = {
      moduleId,
      state: 'closed',
      failureCount: 0,
      successCount: 0,
      config: { ...DEFAULT_CONFIG },
      metrics: {
        state: 'closed',
        failures: 0,
        successes: 0
      }
    };
    this.circuits.set(moduleId, entry);
    return entry;
  }
}
