import { NotificationOrchestrator, SessionNotification } from "./domain";
import {
  NOTIFICATION_ACKED_EVENT,
  NOTIFICATION_DELIVERED_EVENT,
  NOTIFICATION_FAILED_EVENT,
  type NotificationQueuedPayload,
  NOTIFICATION_QUEUED_EVENT,
  type NotificationStatusPayload,
} from "./events";
import type { EventEmitter } from "events";

export interface NotificationHooksOptions {
  events: EventEmitter;
  orchestrator: NotificationOrchestrator;
}

export function bindNotificationHooks({ events, orchestrator }: NotificationHooksOptions): void {
  const emitQueued = (payload: NotificationQueuedPayload) => events.emit(NOTIFICATION_QUEUED_EVENT, payload);
  const emitDelivered = (notification: SessionNotification) =>
    events.emit(NOTIFICATION_DELIVERED_EVENT, { notification } satisfies NotificationStatusPayload);
  const emitAcked = (notification: SessionNotification) =>
    events.emit(NOTIFICATION_ACKED_EVENT, { notification } satisfies NotificationStatusPayload);
  const emitFailed = (notification: SessionNotification) =>
    events.emit(NOTIFICATION_FAILED_EVENT, { notification } satisfies NotificationStatusPayload);

  const originalEnqueue = orchestrator.enqueue.bind(orchestrator);
  orchestrator.enqueue = async (input) => {
    const result = await originalEnqueue(input);
    emitQueued(result);
    return result;
  };

  const originalDelivered = orchestrator.markDelivered.bind(orchestrator);
  orchestrator.markDelivered = async (input) => {
    const notification = await originalDelivered(input);
    emitDelivered(notification);
    return notification;
  };

  const originalAck = orchestrator.ack.bind(orchestrator);
  orchestrator.ack = async (input) => {
    const notification = await originalAck(input);
    emitAcked(notification);
    return notification;
  };

  const originalFail = orchestrator.fail.bind(orchestrator);
  orchestrator.fail = async (input) => {
    const notification = await originalFail(input);
    emitFailed(notification);
    return notification;
  };
}
