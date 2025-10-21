import { EventEmitter } from 'events';
import { ModuleManager } from '../core/moduleManager';
import { RouterService } from './routerService';
import { LogService } from '../services/logService';
import { RecoveryService } from '../services/recoveryService';
import {
  ErrorThreshold,
  FallbackEvent,
  FallbackMetrics,
  FallbackRecoveryStrategy,
  FallbackStatus,
  HealthCheckConfig,
  HealthStatus,
  RecoveryResult,
  RecoveryStatus,
  RouteStatus
} from '../types';

type RecoveryHistoryEntry = RecoveryResult & { moduleId: string; timestamp: string };

type HealthTimer = {
  config: HealthCheckConfig;
  attempts: number;
  failures: number;
  successes: number;
  handle: NodeJS.Timeout;
};

export class FallbackEngine {
  private readonly chains = new Map<string, string[]>();
  private readonly thresholds = new Map<string, ErrorThreshold>();
  private readonly currentRoutes = new Map<string, RouteStatus>();
  private readonly errorBuckets = new Map<string, number[]>();
  private readonly recoveryStrategies = new Map<string, FallbackRecoveryStrategy>();
  private readonly healthChecks = new Map<string, HealthTimer>();
  private readonly metrics: FallbackMetrics = {
    totalFallbacks: 0,
    activeFailovers: 0,
    successfulRecoveries: 0,
    failedRecoveries: 0,
    avgRecoveryTime: 0
  };
  private readonly recoveryHistory: RecoveryHistoryEntry[] = [];
  private readonly events = new EventEmitter();

  constructor(
    private readonly moduleManager: ModuleManager,
    private readonly routerService: RouterService,
    private readonly logService: LogService,
    private readonly recoveryService: RecoveryService
  ) {}

  registerFallback(primaryId: string, fallbackId: string): void {
    const chain = this.chains.get(primaryId) ?? [primaryId];
    if (!chain.includes(fallbackId)) {
      chain.push(fallbackId);
    }
    this.chains.set(primaryId, chain);
    this.ensureRoute(primaryId);
    this.routerService.registerTargets(primaryId, chain);
  }

  registerFallbackChain(primaryId: string, fallbackIds: string[]): void {
    const chain = [primaryId, ...fallbackIds];
    this.chains.set(primaryId, chain);
    this.ensureRoute(primaryId);
    this.routerService.registerTargets(primaryId, chain);
  }

  removeFallback(primaryId: string): void {
    this.chains.delete(primaryId);
    this.currentRoutes.delete(primaryId);
  }

  getFallbackChain(moduleId: string): string[] {
    return this.chains.get(moduleId) ?? [moduleId];
  }

  setErrorThreshold(moduleId: string, threshold: ErrorThreshold): void {
    this.thresholds.set(moduleId, threshold);
  }

  getErrorCount(moduleId: string, timeWindow: number): number {
    const bucket = this.errorBuckets.get(moduleId) ?? [];
    const windowStart = Date.now() - timeWindow;
    return bucket.filter((timestamp) => timestamp >= windowStart).length;
  }

  detectError(moduleId: string, error: Error): void {
    const timestamps = this.errorBuckets.get(moduleId) ?? [];
    const now = Date.now();
    timestamps.push(now);
    this.errorBuckets.set(moduleId, timestamps);

    const threshold = this.thresholds.get(moduleId);
    if (!threshold) {
      return;
    }
    const windowStart = now - threshold.timeWindow;
    const recent = timestamps.filter((ts) => ts >= windowStart);
    this.errorBuckets.set(moduleId, recent);

    if (recent.length >= threshold.maxErrors) {
      this.logService.warn(`Threshold exceeded for ${moduleId}: action ${threshold.action}`, 'fallback');
      switch (threshold.action) {
        case 'fallback':
          void this.triggerFallback(moduleId, `threshold exceeded: ${error.message}`);
          break;
        case 'restart':
          this.logService.warn(`Restart requested for ${moduleId} (not implemented)`, 'fallback');
          break;
        case 'disable':
          void this.moduleManager.setEnabled(moduleId, false);
          break;
        case 'notify':
        default:
          this.logService.warn(`Threshold reached for ${moduleId}: ${error.message}`, 'fallback');
          break;
      }
    }
  }

  async triggerFallback(moduleId: string, reason: string): Promise<void> {
    const chain = this.chains.get(moduleId);
    if (!chain) {
      this.logService.warn(`No fallback chain registered for ${moduleId}`, 'fallback');
      return;
    }
    const current = this.currentRoutes.get(moduleId) ?? this.ensureRoute(moduleId);
    const index = chain.indexOf(current.currentModuleId);
    const nextIndex = Math.min(chain.length - 1, index + 1);
    if (nextIndex === index) {
      this.logService.warn(`Already at deepest fallback for ${moduleId}`, 'fallback');
      return;
    }

    const nextModule = chain[nextIndex];
    this.metrics.totalFallbacks += 1;
    this.metrics.activeFailovers += 1;

    this.currentRoutes.set(moduleId, {
      currentModuleId: nextModule,
      isPrimary: nextIndex === 0,
      fallbackLevel: nextIndex,
      lastSwitch: new Date().toISOString(),
      reason
    });
    this.routerService.setActiveTarget(moduleId, nextModule);
    this.events.emit('fallback', {
      type: 'triggered',
      primaryId: moduleId,
      fallbackId: nextModule,
      reason,
      timestamp: new Date().toISOString()
    } satisfies FallbackEvent);

    this.logService.warn(`Fallback triggered for ${moduleId} -> ${nextModule}: ${reason}`, 'fallback');
  }

  async revertToPrimary(moduleId: string): Promise<void> {
    const chain = this.chains.get(moduleId);
    if (!chain) {
      return;
    }
    const primary = chain[0];
    this.currentRoutes.set(moduleId, {
      currentModuleId: primary,
      isPrimary: true,
      fallbackLevel: 0,
      lastSwitch: new Date().toISOString()
    });
    this.routerService.setActiveTarget(moduleId, primary);
    if (this.metrics.activeFailovers > 0) {
      this.metrics.activeFailovers -= 1;
    }
    this.events.emit('fallback', {
      type: 'recovered',
      primaryId: moduleId,
      fallbackId: primary,
      reason: 'revert-primary',
      timestamp: new Date().toISOString()
    } satisfies FallbackEvent);
  }

  getCurrentRoute(moduleId: string): RouteStatus {
    return this.currentRoutes.get(moduleId) ?? this.ensureRoute(moduleId);
  }

  getFallbackMetrics(): FallbackMetrics {
    return { ...this.metrics };
  }

  getRecoveryHistory(): RecoveryResult[] {
    return [...this.recoveryHistory].slice(-50);
  }

  getStatus(): FallbackStatus {
    const chains: Record<string, string[]> = {};
    const routes: Record<string, RouteStatus> = {};
    const thresholds: Record<string, ErrorThreshold> = {};
    const health: Record<string, HealthCheckConfig> = {};

    this.chains.forEach((value, key) => {
      chains[key] = [...value];
    });
    this.currentRoutes.forEach((value, key) => {
      routes[key] = { ...value };
    });
    this.thresholds.forEach((value, key) => {
      thresholds[key] = { ...value };
    });
    this.healthChecks.forEach((timer, key) => {
      health[key] = { ...timer.config };
    });

    return {
      chains,
      routes,
      thresholds,
      metrics: { ...this.metrics },
      healthChecks: health,
      recoveries: this.getRecoveryHistory()
    };
  }

  onFallbackTriggered(callback: (event: FallbackEvent) => void): () => void {
    const handler = (event: FallbackEvent) => callback(event);
    this.events.on('fallback', handler);
    return () => {
      this.events.off('fallback', handler);
    };
  }

  setRecoveryStrategy(moduleId: string, strategy: FallbackRecoveryStrategy): void {
    this.recoveryStrategies.set(moduleId, strategy);
  }

  async attemptRecovery(moduleId: string): Promise<RecoveryResult> {
    const strategy = this.recoveryStrategies.get(moduleId) ?? 'backoff';
    const start = Date.now();
    try {
      await this.revertToPrimary(moduleId);
      const duration = Date.now() - start;
      const result: RecoveryResult = {
        success: true,
        strategy,
        attempts: 1,
        durationMs: duration
      };
      this.recordRecovery(moduleId, result);
      this.metrics.successfulRecoveries += 1;
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      const result: RecoveryResult = {
        success: false,
        strategy,
        attempts: 1,
        durationMs: duration,
        error: (error as Error).message
      };
      this.recordRecovery(moduleId, result);
      this.metrics.failedRecoveries += 1;
      this.logService.error(`Recovery failed for ${moduleId}: ${(error as Error).message}`, 'fallback');
      return result;
    }
  }

  scheduleRecoveryAttempt(moduleId: string, delayMs: number, strategy: FallbackRecoveryStrategy = 'backoff'): void {
    this.setRecoveryStrategy(moduleId, strategy);
    setTimeout(() => {
      void this.attemptRecovery(moduleId);
    }, delayMs);
  }

  integrateRecoveryStatus(status: RecoveryStatus): void {
    status.strategies.forEach((strategy) => {
      if (strategy.status === 'recovered') {
        void this.revertToPrimary(strategy.moduleId);
      }
    });
  }

  startHealthCheck(moduleId: string, config: HealthCheckConfig): void {
    this.stopHealthCheck(moduleId);
    const handle = setInterval(() => {
      void this.forceHealthCheck(moduleId);
    }, config.interval);
    this.healthChecks.set(moduleId, {
      config,
      attempts: 0,
      failures: 0,
      successes: 0,
      handle
    });
    this.logService.info(`Health check configured for ${moduleId}`, 'fallback');
  }

  stopHealthCheck(moduleId: string): void {
    const timer = this.healthChecks.get(moduleId);
    if (timer?.handle) {
      clearInterval(timer.handle);
    }
    this.healthChecks.delete(moduleId);
  }

  async forceHealthCheck(moduleId: string): Promise<HealthStatus> {
    const timer = this.healthChecks.get(moduleId);
    const config = timer?.config ?? {
      interval: 30_000,
      timeout: 5_000,
      retries: 3,
      failureThreshold: 3,
      successThreshold: 2
    };
    const start = Date.now();
    const module = this.moduleManager.getModule(moduleId);
    const enabled = module?.enabled ?? false;
    const status: HealthStatus = {
      moduleId,
      status: enabled ? 'healthy' : 'unreachable',
      latencyMs: Date.now() - start,
      attempts: (timer?.attempts ?? 0) + 1,
      checkedAt: new Date().toISOString()
    };

    if (timer) {
      timer.attempts = status.attempts;
      if (status.status === 'healthy') {
        timer.successes += 1;
        timer.failures = 0;
        if (timer.successes >= config.successThreshold) {
          await this.revertToPrimary(moduleId);
        }
      } else {
        timer.failures += 1;
        timer.successes = 0;
        status.lastError = 'module disabled';
        if (timer.failures >= config.failureThreshold) {
          await this.triggerFallback(moduleId, 'health-check-failure');
        }
      }
      this.healthChecks.set(moduleId, timer);
    }

    return status;
  }

  private ensureRoute(moduleId: string): RouteStatus {
    const chain = this.chains.get(moduleId) ?? [moduleId];
    const primary = chain[0];
    const status: RouteStatus = {
      currentModuleId: primary,
      isPrimary: true,
      fallbackLevel: 0,
      lastSwitch: new Date().toISOString()
    };
    this.currentRoutes.set(moduleId, status);
    this.routerService.registerTargets(moduleId, chain);
    this.routerService.setActiveTarget(moduleId, primary);
    return status;
  }

  private recordRecovery(moduleId: string, result: RecoveryResult): void {
    if (this.metrics.activeFailovers > 0 && result.success) {
      this.metrics.activeFailovers -= 1;
    }
    const entry: RecoveryHistoryEntry = {
      moduleId,
      timestamp: new Date().toISOString(),
      ...result
    };
    this.recoveryHistory.push(entry);
    const totalDuration = this.recoveryHistory.reduce((acc, item) => acc + item.durationMs, 0);
    this.metrics.avgRecoveryTime = Math.round(totalDuration / this.recoveryHistory.length);
  }
}
