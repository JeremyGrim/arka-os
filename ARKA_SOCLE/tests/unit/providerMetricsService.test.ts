import { beforeEach, describe, expect, it } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import { LogService } from '../../src/services/logService';
import { ProviderMetricsService } from '../../src/services/providerMetricsService';
import type { EventBus } from '../../src/services/eventBus';

const TMP_DIR = path.join(process.cwd(), '.tmp-tests', 'provider-metrics');

describe('ProviderMetricsService', () => {
  let service: ProviderMetricsService;
  let logService: LogService;

  beforeEach(async () => {
    await fs.remove(TMP_DIR);
    logService = new LogService(TMP_DIR);
    await logService.init();
    service = new ProviderMetricsService(logService);
  });

  it('tracks latency averages and switch counts', () => {
    service.recordDispatch({ providerId: 'claude', sessionId: 'sess-1', latencyMs: 120 });
    service.recordDispatch({ providerId: 'claude', sessionId: 'sess-1', latencyMs: 100 });
    service.recordDispatch({ providerId: 'gemini', sessionId: 'sess-1', latencyMs: 90 });

    const snapshot = service.getSnapshot();
    expect(snapshot.totalDispatches).toBe(3);
    expect(snapshot.totalSwitches).toBe(1);

    const claude = snapshot.providers.find((provider) => provider.providerId === 'claude');
    const gemini = snapshot.providers.find((provider) => provider.providerId === 'gemini');

    expect(claude?.dispatchCount).toBe(2);
    expect(claude?.switchOutCount).toBe(1);
    expect(claude?.averageLatencyMs).toBeCloseTo(110, 1);

    expect(gemini?.dispatchCount).toBe(1);
    expect(gemini?.switchInCount).toBe(1);
    expect(gemini?.averageLatencyMs).toBeCloseTo(90, 1);
  });

  it('emits provider.switch event via event bus', () => {
    const events: Array<{ event: string; payload: any }> = [];
    const stubEventBus = {
      emit(event: string, payload: unknown) {
        events.push({ event, payload });
      },
      on() {
        // noop for tests
      }
    } as unknown as EventBus;
    service = new ProviderMetricsService(logService, stubEventBus);

    service.recordDispatch({ providerId: 'claude', sessionId: 'sess-2' });
    service.recordDispatch({ providerId: 'gemini', sessionId: 'sess-2' });

    expect(events.length).toBe(1);
    expect(events[0].event).toBe('provider.switch');
    expect(events[0].payload).toMatchObject({
      from: 'claude',
      to: 'gemini',
      sessionId: 'sess-2'
    });
  });
});
