import { NotificationDomainError, NotificationStore, SessionNotification } from "../domain";

export interface InMemoryNotificationStoreOptions {
  ttlMs?: number;
  onExpire?(notification: SessionNotification): void;
}

interface TimerEntry {
  timeout: NodeJS.Timeout;
  expiresAt: number;
}

export class InMemoryNotificationStore implements NotificationStore {
  private readonly items = new Map<string, SessionNotification>();
  private readonly timers = new Map<string, TimerEntry>();
  private readonly ttlMs: number;
  private readonly onExpire?: (notification: SessionNotification) => void;

  constructor(options?: InMemoryNotificationStoreOptions) {
    this.ttlMs = Math.max(1_000, options?.ttlMs ?? 15 * 60 * 1_000);
    this.onExpire = options?.onExpire;
  }

  async insert(notification: SessionNotification): Promise<void> {
    if (this.items.has(notification.id)) {
      throw new NotificationDomainError(`Notification déjà présente: ${notification.id}`);
    }
    const clone = this.clone(notification);
    this.items.set(clone.id, clone);
    this.scheduleExpiration(clone);
  }

  async update(notification: SessionNotification): Promise<void> {
    if (!this.items.has(notification.id)) {
      throw new NotificationDomainError(`Notification introuvable: ${notification.id}`);
    }
    const clone = this.clone(notification);
    this.items.set(clone.id, clone);
    this.scheduleExpiration(clone);
  }

  async getById(id: string): Promise<SessionNotification | undefined> {
    const stored = this.items.get(id);
    return stored ? this.clone(stored) : undefined;
  }

  async listDueForRetry(reference: Date): Promise<SessionNotification[]> {
    const now = reference.getTime();
    const due: SessionNotification[] = [];
    for (const notification of this.items.values()) {
      if (notification.status !== "queued") {
        continue;
      }
      if (!notification.retryAfter) {
        continue;
      }
      const retryAt = Date.parse(notification.retryAfter);
      if (!Number.isNaN(retryAt) && retryAt <= now) {
        due.push(this.clone(notification));
      }
    }
    return due;
  }

  private clone(notification: SessionNotification): SessionNotification {
    return {
      ...notification,
      payload: {
        ...notification.payload,
        metadata: notification.payload.metadata ? { ...notification.payload.metadata } : undefined,
      },
    };
  }

  private scheduleExpiration(notification: SessionNotification): void {
    this.clearTimer(notification.id);
    if (notification.status === "acked" || notification.status === "failed") {
      return;
    }
    const expiresAt = Date.now() + this.ttlMs;
    const timeout = setTimeout(() => {
      this.items.delete(notification.id);
      this.timers.delete(notification.id);
      this.onExpire?.(notification);
    }, this.ttlMs);
    timeout.unref?.();
    this.timers.set(notification.id, { timeout, expiresAt });
  }

  private clearTimer(id: string): void {
    const entry = this.timers.get(id);
    if (entry) {
      clearTimeout(entry.timeout);
      this.timers.delete(id);
    }
  }
}
