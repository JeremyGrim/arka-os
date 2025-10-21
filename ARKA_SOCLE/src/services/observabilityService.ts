import { promises as fs } from 'fs';
import path from 'path';
import { LogEntry } from '../types';
import { LogService } from './logService';

interface ProviderSwitchEvent {
  timestamp: string;
  from?: string;
  to: string;
  sessionId?: string;
}

interface HandoffEvent {
  timestamp: string;
  kind: string;
  message: string;
  sessionId?: string;
}

interface ProviderSwitchSummary {
  total: number;
  providers: Array<{
    providerId: string;
    outgoing: number;
    incoming: number;
  }>;
  lastEvents: ProviderSwitchEvent[];
  updatedAt: string;
}

interface HandoffSummary {
  total: number;
  kinds: Record<string, number>;
  lastEvents: HandoffEvent[];
  updatedAt: string;
}

interface NotificationEvent {
  timestamp: string;
  type: 'queued' | 'delivered' | 'acked' | 'failed' | 'retry' | 'alert';
  message: string;
  sessionId?: string;
  deliveryId?: string;
}

interface NotificationSummary {
  counts: Record<'queued' | 'delivered' | 'acked' | 'failed' | 'retry' | 'alert', number>;
  lastEvents: NotificationEvent[];
  updatedAt: string;
}

const MAX_ENTRIES = 200;

export class ObservabilityService {
  private providerEvents: ProviderSwitchEvent[] = [];
  private handoffEvents: HandoffEvent[] = [];
  private notificationEvents: NotificationEvent[] = [];
  private notificationCounts: NotificationSummary['counts'] = {
    queued: 0,
    delivered: 0,
    acked: 0,
    failed: 0,
    retry: 0,
    alert: 0,
  };
  private readonly providerFile: string;
  private readonly handoffFile: string;

  constructor(private readonly storageDir: string, private readonly logService: LogService) {
    this.providerFile = path.join(this.storageDir, 'provider-switch.json');
    this.handoffFile = path.join(this.storageDir, 'handoff-events.json');
    this.logService.onLog((entry) => this.handleLog(entry));
  }

  async init(): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });
    this.providerEvents = await this.readJson<ProviderSwitchEvent[]>(this.providerFile, []);
    this.handoffEvents = await this.readJson<HandoffEvent[]>(this.handoffFile, []);
  }

  getProviderSwitchSummary(): ProviderSwitchSummary {
    const counters = new Map<string, { incoming: number; outgoing: number }>();
    for (const event of this.providerEvents) {
      if (event.from) {
        const current = counters.get(event.from) ?? { incoming: 0, outgoing: 0 };
        current.outgoing += 1;
        counters.set(event.from, current);
      }
      const current = counters.get(event.to) ?? { incoming: 0, outgoing: 0 };
      current.incoming += 1;
      counters.set(event.to, current);
    }

    return {
      total: this.providerEvents.length,
      providers: Array.from(counters.entries())
        .map(([providerId, counts]) => ({ providerId, ...counts }))
        .sort((a, b) => a.providerId.localeCompare(b.providerId)),
      lastEvents: this.providerEvents.slice(-50),
      updatedAt: new Date().toISOString()
    };
  }

  getHandoffSummary(): HandoffSummary {
    const kinds: Record<string, number> = {};
    for (const event of this.handoffEvents) {
      kinds[event.kind] = (kinds[event.kind] ?? 0) + 1;
    }

    return {
      total: this.handoffEvents.length,
      kinds,
      lastEvents: this.handoffEvents.slice(-50),
      updatedAt: new Date().toISOString()
    };
  }

  getNotificationSummary(): NotificationSummary {
    return {
      counts: { ...this.notificationCounts },
      lastEvents: this.notificationEvents.slice(-50),
      updatedAt: new Date().toISOString()
    };
  }

  private handleLog(entry: LogEntry): void {
    const { message } = entry;
    if (message.startsWith('provider.switch')) {
      const event = this.parseProviderSwitch(entry);
      this.providerEvents.push(event);
      this.providerEvents = this.providerEvents.slice(-MAX_ENTRIES);
      void this.persist(this.providerFile, this.providerEvents).catch((error) => {
        // eslint-disable-next-line no-console
        console.warn('Persist provider switch events failed', error);
      });
      return;
    }

    if (message.startsWith('handoff.')) {
      const event = this.parseHandoff(entry);
      this.handoffEvents.push(event);
      this.handoffEvents = this.handoffEvents.slice(-MAX_ENTRIES);
      void this.persist(this.handoffFile, this.handoffEvents).catch((error) => {
        // eslint-disable-next-line no-console
        console.warn('Persist handoff events failed', error);
      });
      return;
    }

    if (message.startsWith('notification.')) {
      const event = this.parseNotification(entry);
      if (!event) {
        return;
      }
      this.notificationCounts[event.type] += 1;
      this.notificationEvents.push(event);
      this.notificationEvents = this.notificationEvents.slice(-MAX_ENTRIES);
    }
  }

  private parseProviderSwitch(entry: LogEntry): ProviderSwitchEvent {
    const match = entry.message.match(/^provider\.switch\s+(\S+)?\s*->\s*(\S+)/);
    const [, from, to] = match ?? [];
    return {
      timestamp: entry.timestamp,
      from: from?.trim(),
      to: to?.trim() ?? 'unknown',
      sessionId: entry.sessionId
    };
  }

  private parseHandoff(entry: LogEntry): HandoffEvent {
    const [kind] = entry.message.split(' ', 1);
    return {
      timestamp: entry.timestamp,
      kind: kind ?? 'handoff.unknown',
      message: entry.message,
      sessionId: entry.sessionId
    };
  }

  private parseNotification(entry: LogEntry): NotificationEvent | undefined {
    const [prefix, rest] = entry.message.split(' ', 2);
    const type = prefix.split('.')[1] as NotificationEvent['type'] | undefined;
    if (!type || !(type in this.notificationCounts)) {
      return undefined;
    }
    const deliveryMatch = rest?.match(/delivery=([^\s]+)/);
    return {
      timestamp: entry.timestamp,
      type,
      message: entry.message,
      sessionId: entry.sessionId,
      deliveryId: deliveryMatch?.[1],
    };
  }

  private async persist(filePath: string, data: unknown): Promise<void> {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  private async readJson<T>(filePath: string, fallback: T): Promise<T> {
    try {
      const buffer = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(buffer) as T;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        return fallback;
      }
      throw error;
    }
  }
}
