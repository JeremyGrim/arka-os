import type { Server } from "http";
import type { EventEmitter } from "events";
import WebSocket, { WebSocketServer } from "ws";

import {
  NOTIFICATION_ACKED_EVENT,
  NOTIFICATION_DELIVERED_EVENT,
  NOTIFICATION_FAILED_EVENT,
  NOTIFICATION_QUEUED_EVENT,
  type NotificationQueuedPayload,
  type NotificationStatusPayload,
} from "../notifications/events";

export interface WebSocketGateway {
  initialize(): void;
  dispose(): void;
}

interface ClientEntry {
  socket: WebSocket;
  heartbeat: NodeJS.Timeout;
}

const HEARTBEAT_INTERVAL_MS = 30_000;
const ROUTE_PATTERN = /^\/ws\/sessions\/([^/]+)\/notifications$/;

export interface WebSocketGatewayOptions {
  WebSocketServerClass?: typeof WebSocketServer;
  WebSocketClass?: typeof WebSocket;
  allowedOrigins?: string[];
  apiKey?: string;
}

export function createWebSocketGateway(
  server: Server,
  events: EventEmitter,
  options: WebSocketGatewayOptions = {},
): WebSocketGateway {
  const WsServer = options.WebSocketServerClass ?? WebSocketServer;
  const WsClass = options.WebSocketClass ?? WebSocket;
  const allowedOrigins = options.allowedOrigins?.filter(Boolean);
  const apiKey = options.apiKey;

  const wss = new WsServer({ server }) as WebSocketServer;
  const clientsBySession = new Map<string, Set<ClientEntry>>();

  const connectionHandler = (ws: WebSocket, request: { url?: string; headers: Record<string, string | string[] | undefined> }) => {
    if (allowedOrigins?.length) {
      const originHeader = request.headers?.origin;
      const origin = typeof originHeader === "string" ? originHeader : Array.isArray(originHeader) ? originHeader[0] : "";
      if (!origin || !allowedOrigins.includes(origin)) {
        ws.close(1008, "origin not allowed");
        return;
      }
    }
    if (apiKey) {
      const keyHeader = request.headers?.["x-api-key"];
      const key = typeof keyHeader === "string" ? keyHeader : Array.isArray(keyHeader) ? keyHeader[0] : undefined;
      if (key !== apiKey) {
        ws.close(1008, "unauthorized");
        return;
      }
    }
    const sessionId = extractSessionId(request.url ?? "");
    if (!sessionId) {
      ws.close(1008, "sessionId invalide");
      return;
    }
    registerClient(sessionId, ws);
    ws.on("close", () => unregisterClient(sessionId, ws));
    ws.on("error", () => unregisterClient(sessionId, ws));
  };

  const broadcast = (
    notification: NotificationStatusPayload["notification"],
    type: string,
    extra?: Record<string, unknown>,
  ) => {
    const bucket = clientsBySession.get(notification.sessionId);
    if (!bucket?.size) {
      return;
    }
    const message = JSON.stringify({
      type,
      sessionId: notification.sessionId,
      deliveryId: notification.id,
      actionId: notification.actionId,
      status: notification.status,
      attempts: notification.attempts,
      text: notification.payload.text,
      metadata: notification.payload.metadata ?? null,
      queuedAt: notification.queuedAt,
      deliveredAt: notification.deliveredAt ?? null,
      ackedAt: notification.ackedAt ?? null,
      failedAt: notification.failedAt ?? null,
      retryAfter: notification.retryAfter ?? null,
      ...extra,
    });
    for (const client of bucket) {
      if (client.socket.readyState === WsClass.OPEN) {
        client.socket.send(message);
      }
    }
  };

  const queuedHandler = (payload: NotificationQueuedPayload) => {
    broadcast(payload.notification, "queued", { isNew: payload.isNew });
  };

  const deliveredHandler = ({ notification }: NotificationStatusPayload) => broadcast(notification, "delivered");
  const ackedHandler = ({ notification }: NotificationStatusPayload) => broadcast(notification, "acked");
  const failedHandler = ({ notification }: NotificationStatusPayload) => broadcast(notification, "failed");

  function registerClient(sessionId: string, socket: WebSocket): void {
    const bucket = getOrCreateBucket(sessionId);
    const heartbeat = setInterval(() => {
      if (socket.readyState === WsClass.OPEN) {
        socket.ping();
      }
    }, HEARTBEAT_INTERVAL_MS);
    heartbeat.unref?.();
    bucket.add({ socket, heartbeat });
    socket.send(JSON.stringify({ type: "ready", sessionId }));
  }

  function unregisterClient(sessionId: string, socket: WebSocket): void {
    const bucket = clientsBySession.get(sessionId);
    if (!bucket) return;
    for (const entry of bucket) {
      if (entry.socket === socket) {
        clearInterval(entry.heartbeat);
        bucket.delete(entry);
        break;
      }
    }
    if (bucket.size === 0) {
      clientsBySession.delete(sessionId);
    }
  }

  function getOrCreateBucket(sessionId: string): Set<ClientEntry> {
    let bucket = clientsBySession.get(sessionId);
    if (!bucket) {
      bucket = new Set<ClientEntry>();
      clientsBySession.set(sessionId, bucket);
    }
    return bucket;
  }

  function disposeAllClients(): void {
    for (const bucket of clientsBySession.values()) {
      for (const entry of bucket) {
        clearInterval(entry.heartbeat);
        try {
          entry.socket.close();
        } catch {
          // ignore
        }
      }
    }
    clientsBySession.clear();
  }

  return {
    initialize() {
      wss.on("connection", connectionHandler);
      events.on(NOTIFICATION_QUEUED_EVENT, queuedHandler);
      events.on(NOTIFICATION_DELIVERED_EVENT, deliveredHandler);
      events.on(NOTIFICATION_ACKED_EVENT, ackedHandler);
      events.on(NOTIFICATION_FAILED_EVENT, failedHandler);
    },
    dispose() {
      events.off(NOTIFICATION_QUEUED_EVENT, queuedHandler);
      events.off(NOTIFICATION_DELIVERED_EVENT, deliveredHandler);
      events.off(NOTIFICATION_ACKED_EVENT, ackedHandler);
      events.off(NOTIFICATION_FAILED_EVENT, failedHandler);
      wss.off("connection", connectionHandler);
      disposeAllClients();
      wss.close();
    },
  };
}

function extractSessionId(url: string): string | undefined {
  const match = ROUTE_PATTERN.exec(url.split("?")[0] ?? "");
  return match?.[1];
}
