import { EventEmitter } from "events";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { createWebSocketGateway } from "../../../src/server/websocket";
import { NOTIFICATION_DELIVERED_EVENT, NOTIFICATION_QUEUED_EVENT } from "../../../src/notifications/events";

class StubSocket extends EventEmitter {
  static OPEN = 1;
  readyState = StubSocket.OPEN;
  sent: string[] = [];
  pings = 0;

  ping() {
    this.pings += 1;
  }
  send(message: string) {
    this.sent.push(message);
  }
  close() {
    this.readyState = 3;
    this.emit("close");
  }
}

class StubWebSocketServer extends EventEmitter {
  static latest?: StubWebSocketServer;
  constructor(public options: any) {
    super();
    StubWebSocketServer.latest = this;
  }
  close() {
    this.emit("closed");
  }
}

const fakeServer = { on: vi.fn(), off: vi.fn() } as any;

describe("WebSocket gateway", () => {
  let events: EventEmitter;

  beforeEach(() => {
    events = new EventEmitter();
    StubWebSocketServer.latest = undefined;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    events.removeAllListeners();
  });

  it("enregistre les clients et diffuse les notifications", () => {
    const gateway = createWebSocketGateway(fakeServer, events, {
      WebSocketServerClass: StubWebSocketServer as any,
      WebSocketClass: StubSocket as any,
    });
    gateway.initialize();
    const wss = StubWebSocketServer.latest!;

    const socket = new StubSocket();
    wss.emit("connection", socket, { url: "/ws/sessions/sess-1/notifications" });

    expect(socket.sent[0]).toContain("\"type\":\"ready\"");

    events.emit(NOTIFICATION_QUEUED_EVENT, {
      notification: {
        id: "notif-1",
        actionId: "action-1",
        sessionId: "sess-1",
        status: "queued",
        attempts: 0,
        maxAttempts: 5,
        payload: { text: "Hello" },
        queuedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        slaExpiresAt: new Date(Date.now() + 30_000).toISOString(),
      },
      isNew: true,
    });

    const queuedMessage = JSON.parse(socket.sent[1]);
    expect(queuedMessage.type).toBe("queued");
    expect(queuedMessage.deliveryId).toBe("notif-1");
    expect(queuedMessage.sessionId).toBe("sess-1");

    vi.advanceTimersByTime(30_000);
    expect(socket.pings).toBeGreaterThan(0);

    gateway.dispose();
  });

  it("filtre les sessions et nettoie les clients", () => {
    const gateway = createWebSocketGateway(fakeServer, events, {
      WebSocketServerClass: StubWebSocketServer as any,
      WebSocketClass: StubSocket as any,
    });
    gateway.initialize();
    const wss = StubWebSocketServer.latest!;

    const socket = new StubSocket();
    wss.emit("connection", socket, { url: "/ws/sessions/sess-2/notifications" });

    events.emit(NOTIFICATION_QUEUED_EVENT, {
      notification: {
        id: "notif-1",
        actionId: "action-1",
        sessionId: "sess-1",
        status: "queued",
        attempts: 0,
        maxAttempts: 5,
        payload: { text: "Hello" },
        queuedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        slaExpiresAt: new Date(Date.now() + 30_000).toISOString(),
      },
      isNew: true,
    });

    expect(socket.sent).toHaveLength(1);

    socket.emit("close");
    gateway.dispose();
  });

  it("diffuse les statuts delivered", () => {
    const gateway = createWebSocketGateway(fakeServer, events, {
      WebSocketServerClass: StubWebSocketServer as any,
      WebSocketClass: StubSocket as any,
    });
    gateway.initialize();
    const wss = StubWebSocketServer.latest!;
    const socket = new StubSocket();
    wss.emit("connection", socket, { url: "/ws/sessions/sess-3/notifications" });
    socket.sent = [];

    events.emit(NOTIFICATION_DELIVERED_EVENT, {
      notification: {
        id: "notif-2",
        actionId: "action-2",
        sessionId: "sess-3",
        status: "delivered",
        attempts: 1,
        maxAttempts: 5,
        payload: { text: "Ok" },
        queuedAt: new Date().toISOString(),
        deliveredAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        slaExpiresAt: new Date(Date.now() + 30_000).toISOString(),
        ackedAt: undefined,
        failedAt: undefined,
        retryAfter: undefined,
      },
    });

    expect(socket.sent).toHaveLength(1);
    const deliveredMessage = JSON.parse(socket.sent[0]);
    expect(deliveredMessage.type).toBe("delivered");
    expect(deliveredMessage.deliveryId).toBe("notif-2");
    expect(deliveredMessage.sessionId).toBe("sess-3");

    gateway.dispose();
  });
});
