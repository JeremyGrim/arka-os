import type { SessionNotification } from "./domain/sessionNotification";

export const NOTIFICATION_QUEUED_EVENT = "notification:queued";
export const NOTIFICATION_DELIVERED_EVENT = "notification:delivered";
export const NOTIFICATION_FAILED_EVENT = "notification:failed";
export const NOTIFICATION_ACKED_EVENT = "notification:acked";

export interface NotificationQueuedPayload {
  notification: SessionNotification;
  isNew: boolean;
}

export interface NotificationStatusPayload {
  notification: SessionNotification;
}
