import { randomUUID } from "node:crypto";

export type NotificationStatus = "queued" | "delivered" | "acked" | "failed";

export interface SessionNotificationPayload {
  text: string;
  metadata?: Record<string, unknown>;
}

export interface SessionNotification {
  id: string;
  sessionId: string;
  actionId: string;
  status: NotificationStatus;
  attempts: number;
  maxAttempts: number;
  payload: SessionNotificationPayload;
  queuedAt: string;
  deliveredAt?: string;
  ackedAt?: string;
  failedAt?: string;
  retryAfter?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  slaExpiresAt: string;
}

export interface EnqueueNotificationInput {
  sessionId: string;
  text: string;
  actionId?: string;
  metadata?: Record<string, unknown>;
  deliveryId?: string;
  slaSeconds?: number;
  maxAttempts?: number;
}

export interface MarkDeliveredInput {
  deliveryId: string;
  reason?: string;
  deliveredAt?: Date;
}

export interface AckNotificationInput {
  deliveryId: string;
  ackedAt?: Date;
}

export interface MarkFailedInput {
  deliveryId: string;
  error: string;
  failedAt?: Date;
}

export interface ScheduleRetryInput {
  deliveryId: string;
  reason: string;
  requestedAt?: Date;
}

export interface Clock {
  now(): Date;
}

export const SYSTEM_CLOCK: Clock = {
  now() {
    return new Date();
  },
};

export interface NotificationStore {
  insert(notification: SessionNotification): Promise<void>;
  update(notification: SessionNotification): Promise<void>;
  getById(id: string): Promise<SessionNotification | undefined>;
  listDueForRetry(reference: Date): Promise<SessionNotification[]>;
}

export class NotificationDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationDomainError";
  }
}

export interface NotificationPolicyOptions {
  slaSeconds: number;
  maxAttempts: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
}

export const DEFAULT_POLICY: NotificationPolicyOptions = Object.freeze({
  slaSeconds: 30,
  maxAttempts: 5,
  retryBaseDelayMs: 5_000,
  retryMaxDelayMs: 60_000,
});

export function createNotification(
  input: EnqueueNotificationInput,
  clock: Clock,
  policy: NotificationPolicyOptions,
): SessionNotification {
  if (!input.sessionId?.trim()) {
    throw new NotificationDomainError("sessionId requis");
  }
  if (!input.text?.trim()) {
    throw new NotificationDomainError("text requis");
  }

  const createdAt = clock.now();
  const id = input.deliveryId?.trim() || randomUUID();
  const actionId = input.actionId?.trim() || randomUUID();
  const slaSeconds = Math.max(1, input.slaSeconds ?? policy.slaSeconds);
  const maxAttempts = Math.max(1, input.maxAttempts ?? policy.maxAttempts);
  const isoCreated = createdAt.toISOString();

  return {
    id,
    sessionId: input.sessionId,
    actionId,
    status: "queued",
    attempts: 0,
    maxAttempts,
    payload: {
      text: input.text,
      metadata: input.metadata,
    },
    queuedAt: isoCreated,
    createdAt: isoCreated,
    updatedAt: isoCreated,
    slaExpiresAt: new Date(createdAt.getTime() + slaSeconds * 1_000).toISOString(),
  };
}

export function markDelivered(notification: SessionNotification, input: MarkDeliveredInput, clock: Clock): SessionNotification {
  if (notification.status === "failed") {
    throw new NotificationDomainError("Notification déjà en échec");
  }
  if (notification.status === "acked") {
    return notification;
  }
  const deliveredAt = (input.deliveredAt ?? clock.now()).toISOString();
  return {
    ...notification,
    status: "delivered",
    deliveredAt,
    updatedAt: deliveredAt,
    lastError: input.reason ?? notification.lastError,
  };
}

export function ackNotification(notification: SessionNotification, input: AckNotificationInput, clock: Clock): SessionNotification {
  if (notification.status === "failed") {
    throw new NotificationDomainError("Notification déjà en échec");
  }
  const ackedAt = (input.ackedAt ?? clock.now()).toISOString();
  if (notification.status === "acked" && notification.ackedAt === ackedAt) {
    return notification;
  }
  if (notification.status !== "delivered" && notification.status !== "queued") {
    throw new NotificationDomainError(`Etat invalide pour ack: ${notification.status}`);
  }
  return {
    ...notification,
    status: "acked",
    ackedAt,
    updatedAt: ackedAt,
    retryAfter: undefined,
    lastError: undefined,
  };
}

export function markFailed(notification: SessionNotification, input: MarkFailedInput, clock: Clock): SessionNotification {
  if (!input.error?.trim()) {
    throw new NotificationDomainError("error requis");
  }
  const failedAt = (input.failedAt ?? clock.now()).toISOString();
  return {
    ...notification,
    status: "failed",
    failedAt,
    updatedAt: failedAt,
    retryAfter: undefined,
    lastError: input.error,
  };
}

export function scheduleRetry(
  notification: SessionNotification,
  input: ScheduleRetryInput,
  clock: Clock,
  policy: NotificationPolicyOptions,
): SessionNotification {
  if (notification.status === "failed") {
    throw new NotificationDomainError("Notification en échec définitif");
  }
  if (notification.attempts + 1 >= notification.maxAttempts) {
    return markFailed(notification, { deliveryId: notification.id, error: input.reason }, clock);
  }
  const now = input.requestedAt ?? clock.now();
  const attempts = notification.attempts + 1;
  const delay = computeRetryDelay(attempts, policy);
  const retryAfter = new Date(now.getTime() + delay).toISOString();

  return {
    ...notification,
    attempts,
    status: "queued",
    retryAfter,
    updatedAt: now.toISOString(),
    lastError: input.reason,
  };
}

function computeRetryDelay(attempt: number, policy: NotificationPolicyOptions): number {
  const exponential = policy.retryBaseDelayMs * Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(exponential, policy.retryMaxDelayMs);
}
