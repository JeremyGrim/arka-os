import express from "express";
import bodyParser from "body-parser";
import request from "supertest";
import { EventEmitter } from "events";
import { describe, expect, it, vi } from "vitest";
import { createNotifyRouter } from "../../../src/http/notify";
import type { Container } from "../../../src/container";
import { NotificationDomainError } from "../../../src/notifications/domain";

const defaultSecurity = {
  notifyToken: null,
  rateLimit: { maxPerMinute: 100, windowMs: 60_000 },
  requireTls: false,
  allowInsecureHttp: true,
  socleUrl: undefined,
  environment: "test",
} as const;
import { NOTIFICATION_QUEUED_EVENT } from "../../../src/notifications/events";

function buildContainerMock(enqueueImpl: (input: any) => Promise<any>): Container {
  const events = new EventEmitter();
  const orchestrator = {
    enqueue: vi.fn(async (input: any) => {
      const result = await enqueueImpl(input);
      events.emit(NOTIFICATION_QUEUED_EVENT, result);
      return result;
    }),
    markDelivered: vi.fn(),
    ack: vi.fn(),
    fail: vi.fn(),
    retry: vi.fn(),
  };

  return {
    notificationEvents: events,
    notificationOrchestrator: orchestrator as any,
    logService: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      init: vi.fn(),
      onLog: vi.fn(),
      getLogs: vi.fn(),
    },
    // The remaining properties are not used by createNotifyRouter but must exist for the Container type.
    moduleManager: {} as any,
    contextSync: {} as any,
    sessionOrchestrator: {} as any,
    metaEngine: {} as any,
    validationCore: {} as any,
    configService: {} as any,
    eventBus: {} as any,
    persistence: {} as any,
    recovery: {} as any,
    diagnostics: {} as any,
    routerService: {} as any,
    fallbackEngine: {} as any,
    circuitBreaker: {} as any,
    providerMetrics: {} as any,
    observability: {} as any,
    notificationStore: {} as any,
    init: async () => {},
  };
}

describe("POST /api/sessions/:id/notify", () => {
  it("enqueue la notification et émet un événement", async () => {
    const payload = {
      notification: {
        id: "notif-1",
        actionId: "action-1",
        sessionId: "sess-1",
        status: "queued",
        attempts: 0,
        maxAttempts: 5,
        payload: { text: "Bonjour", metadata: { priority: "high" } },
        queuedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        slaExpiresAt: new Date(Date.now() + 30_000).toISOString(),
      },
    };
    const container = buildContainerMock(async () => ({
      ...payload,
      isNew: true,
    }));
    const app = express();
    app.use(bodyParser.json());
    app.use(createNotifyRouter(container, defaultSecurity));

    const eventPromise = new Promise<void>((resolve) => {
      container.notificationEvents.once("notification:queued", (event) => {
        expect(event.notification.id).toBe(payload.notification.id);
        resolve();
      });
    });

    const response = await request(app).post("/api/sessions/sess-1/notify").send({ text: "Bonjour", metadata: { priority: "high" } });

    await eventPromise;
    expect(response.status).toBe(202);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: "queued",
        deliveryId: payload.notification.id,
        actionId: payload.notification.actionId,
        isNew: true,
      }),
    );
  });

  it("retourne 200 si la notification existe déjà", async () => {
    const container = buildContainerMock(async () => ({
      notification: {
        id: "notif-existing",
        actionId: "action-1",
        sessionId: "sess-1",
        status: "queued",
        attempts: 1,
        maxAttempts: 5,
        payload: { text: "Bonjour" },
        queuedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        slaExpiresAt: new Date(Date.now() + 30_000).toISOString(),
      },
      isNew: false,
    }));
    const app = express();
    app.use(bodyParser.json());
    app.use(createNotifyRouter(container, defaultSecurity));

    const response = await request(app).post("/api/sessions/sess-1/notify").send({ text: "Bonjour" });

    expect(response.status).toBe(200);
    expect(response.body.isNew).toBe(false);
  });

  it("retourne 400 si le texte est manquant", async () => {
    const container = buildContainerMock(async () => ({
      notification: {} as any,
      isNew: true,
    }));
    const app = express();
    app.use(bodyParser.json());
    app.use(createNotifyRouter(container, defaultSecurity));

    const response = await request(app).post("/api/sessions/sess-1/notify").send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("text requis");
  });

  it("mappe les erreurs domaine en 400", async () => {
    const container = buildContainerMock(async () => {
      throw new NotificationDomainError("sessionId requis");
    });
    const app = express();
    app.use(bodyParser.json());
    app.use(createNotifyRouter(container, defaultSecurity));

    const response = await request(app).post("/api/sessions/sess-1/notify").send({ text: "Bonjour" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("sessionId requis");
  });
});
