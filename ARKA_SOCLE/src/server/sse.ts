import type { Response, Request } from "express";
import express from "express";
import type { EventEmitter } from "events";
import {
  NOTIFICATION_ACKED_EVENT,
  NOTIFICATION_DELIVERED_EVENT,
  NOTIFICATION_FAILED_EVENT,
  NOTIFICATION_QUEUED_EVENT,
  type NotificationQueuedPayload,
  type NotificationStatusPayload,
} from "../notifications/events";

interface ClientConnection {
  response: Response;
  heartbeat: NodeJS.Timeout;
}

export interface SseOptions {
  allowedOrigins?: string[];
}

export function createSseRouter(events: EventEmitter, options: SseOptions = {}): express.Router {
  const router = express.Router();
  const clientsBySession = new Map<string, Set<ClientConnection>>();
  const allowedOrigins = options.allowedOrigins?.filter(Boolean);

  router.get("/events/sessions/:sessionId", (req: Request<{ sessionId: string }>, res: Response) => {
    const sessionId = req.params.sessionId?.trim();
    if (!sessionId) {
      res.status(400).end();
      return;
    }

    if (allowedOrigins?.length) {
      const origin = req.get("origin") ?? "";
      if (!origin || !allowedOrigins.includes(origin)) {
        res.status(403).end();
        return;
      }
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    res.write(`event: ready\ndata: ${JSON.stringify({ sessionId })}\n\n`);

    const heartbeat = setInterval(() => {
      res.write(`event: ping\ndata: ${Date.now()}\n\n`);
    }, 30_000);
    heartbeat.unref?.();

    const entry: ClientConnection = { response: res, heartbeat };
    const bucket = getOrCreateBucket(sessionId);
    bucket.add(entry);
    attachListenersIfNeeded();

    req.on("close", () => {
      clearInterval(heartbeat);
      bucket.delete(entry);
      if (bucket.size === 0) {
        clientsBySession.delete(sessionId);
        detachListenersIfIdle();
      }
    });
  });
  const sendStatus = (notification: NotificationStatusPayload["notification"], type: string, extra?: Record<string, unknown>) => {
    const bucket = clientsBySession.get(notification.sessionId);
    if (!bucket?.size) {
      return;
    }
    const data = JSON.stringify({
      type,
      sessionId: notification.sessionId,
      deliveryId: notification.id,
      actionId: notification.actionId,
      text: notification.payload.text,
      metadata: notification.payload.metadata ?? null,
      status: notification.status,
      queuedAt: notification.queuedAt,
      deliveredAt: notification.deliveredAt ?? null,
      ackedAt: notification.ackedAt ?? null,
      failedAt: notification.failedAt ?? null,
      attempts: notification.attempts,
      retryAfter: notification.retryAfter ?? null,
      ...extra,
    });
    for (const client of bucket) {
      client.response.write(`event: notification-status\ndata: ${data}\n\n`);
    }
  };

  const onQueued = (payload: NotificationQueuedPayload) => {
    sendStatus(payload.notification, "queued", { isNew: payload.isNew });
  };
  const onDelivered = ({ notification }: NotificationStatusPayload) => {
    sendStatus(notification, "delivered");
  };
  const onAcked = ({ notification }: NotificationStatusPayload) => {
    sendStatus(notification, "acked");
  };
  const onFailed = ({ notification }: NotificationStatusPayload) => {
    sendStatus(notification, "failed");
  };

  let listenersAttached = false;

  const attachListenersIfNeeded = () => {
    if (listenersAttached) {
      return;
    }
    events.on(NOTIFICATION_QUEUED_EVENT, onQueued);
    events.on(NOTIFICATION_DELIVERED_EVENT, onDelivered);
    events.on(NOTIFICATION_ACKED_EVENT, onAcked);
    events.on(NOTIFICATION_FAILED_EVENT, onFailed);
    listenersAttached = true;
  };

  const detachListenersIfIdle = () => {
    if (!listenersAttached || clientsBySession.size > 0) {
      return;
    }
    events.off(NOTIFICATION_QUEUED_EVENT, onQueued);
    events.off(NOTIFICATION_DELIVERED_EVENT, onDelivered);
    events.off(NOTIFICATION_ACKED_EVENT, onAcked);
    events.off(NOTIFICATION_FAILED_EVENT, onFailed);
    listenersAttached = false;
  };

  function getOrCreateBucket(sessionId: string): Set<ClientConnection> {
    let bucket = clientsBySession.get(sessionId);
    if (!bucket) {
      bucket = new Set<ClientConnection>();
      clientsBySession.set(sessionId, bucket);
    }
    return bucket;
  }

  detachListenersIfIdle();

  return router;
}
