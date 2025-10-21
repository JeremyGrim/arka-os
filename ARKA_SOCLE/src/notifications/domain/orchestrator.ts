import {
  AckNotificationInput,
  Clock,
  DEFAULT_POLICY,
  EnqueueNotificationInput,
  MarkDeliveredInput,
  MarkFailedInput,
  NotificationDomainError,
  NotificationPolicyOptions,
  NotificationStore,
  ScheduleRetryInput,
  SessionNotification,
  ackNotification,
  createNotification,
  markDelivered,
  markFailed,
  scheduleRetry,
} from "./sessionNotification";

export interface EnqueueResult {
  notification: SessionNotification;
  isNew: boolean;
}

export class NotificationOrchestrator {
  private readonly policy: NotificationPolicyOptions;

  constructor(private readonly store: NotificationStore, private readonly clock: Clock, policy?: Partial<NotificationPolicyOptions>) {
    this.policy = {
      ...DEFAULT_POLICY,
      ...policy,
    };
  }

  async enqueue(input: EnqueueNotificationInput): Promise<EnqueueResult> {
    const existing = input.deliveryId ? await this.store.getById(input.deliveryId) : undefined;
    if (existing) {
      return { notification: existing, isNew: false };
    }
    const notification = createNotification(input, this.clock, this.policy);
    await this.store.insert(notification);
    return { notification, isNew: true };
  }

  async markDelivered(input: MarkDeliveredInput): Promise<SessionNotification> {
    const notification = await this.requireNotification(input.deliveryId);
    const updated = markDelivered(notification, input, this.clock);
    await this.store.update(updated);
    return updated;
  }

  async ack(input: AckNotificationInput): Promise<SessionNotification> {
    const notification = await this.requireNotification(input.deliveryId);
    const updated = ackNotification(notification, input, this.clock);
    await this.store.update(updated);
    return updated;
  }

  async fail(input: MarkFailedInput): Promise<SessionNotification> {
    const notification = await this.requireNotification(input.deliveryId);
    const updated = markFailed(notification, input, this.clock);
    await this.store.update(updated);
    return updated;
  }

  async retry(input: ScheduleRetryInput): Promise<SessionNotification> {
    const notification = await this.requireNotification(input.deliveryId);
    const updated = scheduleRetry(notification, input, this.clock, this.policy);
    await this.store.update(updated);
    return updated;
  }

  private async requireNotification(id: string): Promise<SessionNotification> {
    if (!id?.trim()) {
      throw new NotificationDomainError("deliveryId requis");
    }
    const notification = await this.store.getById(id);
    if (!notification) {
      throw new NotificationDomainError(`Notification introuvable: ${id}`);
    }
    return notification;
  }
}
