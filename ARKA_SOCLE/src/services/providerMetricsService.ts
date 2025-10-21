import { LogService } from './logService';
import { EventBus } from './eventBus';
import { ProviderMetricsReport, ProviderMetricSnapshot } from '../types';

type ProviderId = string;

interface ProviderMetricInternal extends ProviderMetricSnapshot {
  totalLatencyMs: number;
  samples: number;
}

export interface ProviderDispatchPayload {
  providerId: ProviderId;
  sessionId?: string;
  latencyMs?: number;
}

export class ProviderMetricsService {
  private readonly metrics = new Map<ProviderId, ProviderMetricInternal>();
  private readonly sessionProviders = new Map<string, ProviderId>();
  private totalSwitches = 0;
  private totalDispatches = 0;

  constructor(private readonly logger: LogService, private readonly eventBus?: EventBus) {}

  recordDispatch(payload: ProviderDispatchPayload): void {
    const { providerId, sessionId, latencyMs } = payload;
    const now = new Date().toISOString();
    const currentMetric = this.ensureMetric(providerId);

    currentMetric.dispatchCount += 1;
    currentMetric.lastDispatchAt = now;
    this.totalDispatches += 1;

    if (typeof latencyMs === 'number' && !Number.isNaN(latencyMs)) {
      currentMetric.totalLatencyMs += latencyMs;
      currentMetric.samples += 1;
      currentMetric.lastLatencyMs = latencyMs;
      currentMetric.averageLatencyMs = Number((currentMetric.totalLatencyMs / currentMetric.samples).toFixed(2));
    }

    if (sessionId) {
      const previousProvider = this.sessionProviders.get(sessionId);
      if (previousProvider && previousProvider !== providerId) {
        this.registerSwitch(previousProvider, providerId, now, sessionId, currentMetric);
      }
      this.sessionProviders.set(sessionId, providerId);
    }

    this.metrics.set(providerId, currentMetric);
  }

  reset(): void {
    this.metrics.clear();
    this.sessionProviders.clear();
    this.totalDispatches = 0;
    this.totalSwitches = 0;
  }

  getSnapshot(): ProviderMetricsReport {
    const providers = Array.from(this.metrics.values()).map<ProviderMetricSnapshot>(
      ({ totalLatencyMs, samples, ...rest }) => rest
    );

    return {
      totalDispatches: this.totalDispatches,
      totalSwitches: this.totalSwitches,
      providers: providers.sort((a, b) => a.providerId.localeCompare(b.providerId)),
      generatedAt: new Date().toISOString()
    };
  }

  private registerSwitch(
    fromProvider: ProviderId,
    toProvider: ProviderId,
    timestamp: string,
    sessionId: string,
    targetMetric?: ProviderMetricInternal
  ): void {
    const fromMetric = this.ensureMetric(fromProvider);
    const toMetric = targetMetric ?? this.ensureMetric(toProvider);

    fromMetric.switchOutCount += 1;
    fromMetric.lastSwitchAt = timestamp;
    toMetric.switchInCount += 1;
    toMetric.lastSwitchAt = timestamp;

    this.totalSwitches += 1;
    this.logger.info(`provider.switch ${fromProvider} -> ${toProvider}`, 'provider-metrics', sessionId);
    this.eventBus?.emit('provider.switch', {
      from: fromProvider,
      to: toProvider,
      sessionId,
      timestamp
    });

    this.metrics.set(fromProvider, fromMetric);
    this.metrics.set(toProvider, toMetric);
  }

  private ensureMetric(providerId: ProviderId): ProviderMetricInternal {
    const existing = this.metrics.get(providerId);
    if (existing) {
      return existing;
    }
    return {
      providerId,
      dispatchCount: 0,
      switchInCount: 0,
      switchOutCount: 0,
      averageLatencyMs: 0,
      totalLatencyMs: 0,
      samples: 0
    };
  }
}
