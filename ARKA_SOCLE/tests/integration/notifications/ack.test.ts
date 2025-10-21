import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import { promises as fs } from "node:fs";

import express from "express";
import bodyParser from "body-parser";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "events";
import YAML from "yaml";

import { createNotifyRouter } from "../../../src/http/notify";
import type { Container } from "../../../src/container";
import { InMemoryNotificationStore } from "../../../src/notifications/store";
import { NotificationOrchestrator, SYSTEM_CLOCK } from "../../../src/notifications/domain";
import { bindNotificationHooks } from "../../../src/notifications/hooks";
import { RosterUpdater } from "../../../src/notifications/rosterUpdater";
import { MessagingLogger } from "../../../src/notifications/messagingLogger";

const defaultSecurity = {
  notifyToken: null,
  rateLimit: { maxPerMinute: 100, windowMs: 60_000 },
  requireTls: false,
  allowInsecureHttp: true,
  socleUrl: undefined,
  environment: "test",
} as const;

function createTempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "ack-test-"));
}

describe("POST /api/notifications/:id/ack", () => {
  let baseDir: string;
  let rosterPath: string;
  let generalPath: string;

  beforeEach(async () => {
    baseDir = createTempDir();
    rosterPath = path.join(baseDir, "ARKA_META", ".system", "coordination", "ROSTER.yaml");
    generalPath = path.join(baseDir, "ARKA_META", "messaging", "general.yaml");
    await fs.mkdir(path.dirname(rosterPath), { recursive: true });
    const roster = {
      agents: [
        {
          agent_id: "agent-1",
          session_id: null,
          proposed_session_id: "ALIAS-001",
        },
      ],
    };
    await fs.writeFile(rosterPath, YAML.stringify(roster), "utf-8");
  });

  it("acknowledge une notification et met à jour le roster", async () => {
    const events = new EventEmitter();
    const store = new InMemoryNotificationStore();
    const orchestrator = new NotificationOrchestrator(store, SYSTEM_CLOCK);
    bindNotificationHooks({ events, orchestrator });
    const { notification } = await orchestrator.enqueue({ sessionId: "ALIAS-001", text: "Hello world" });

    const rosterUpdater = new RosterUpdater(baseDir);

    const container = {
      notificationEvents: events,
      notificationOrchestrator: orchestrator,
      rosterUpdater,
      messagingLogger: new MessagingLogger(baseDir),
      logService: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        init: async () => {},
        onLog: vi.fn(),
        getLogs: vi.fn(),
      },
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
      notificationStore: store,
      init: async () => {},
    } as unknown as Container;

    const app = express();
    app.use(bodyParser.json());
    app.use(createNotifyRouter(container, defaultSecurity));

    const response = await request(app)
      .post(`/api/notifications/${notification.id}/ack`)
      .send({
        sessionId: "SESSION-001",
        agentId: "agent-1",
        actionId: notification.actionId,
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("acked");

    const updatedRosterRaw = await fs.readFile(rosterPath, "utf8");
    const parsed = YAML.parse(updatedRosterRaw);
    const agentEntry = parsed.agents.find((entry: any) => entry.agent_id === "agent-1");
    expect(agentEntry.session_id).toBe("SESSION-001");
    expect(agentEntry.proposed_session_id).toBeNull();

    expect(container.logService.info as any).toHaveBeenCalledWith(
      expect.stringContaining("delivery="),
      "session-notify",
      "SESSION-001",
    );

    const generalRaw = await fs.readFile(generalPath, "utf8");
    const general = YAML.parse(generalRaw);
    const lastEntry = general.entries.at(-1);
    expect(lastEntry.type).toBe("ack");
    expect(lastEntry.notes).toContain("SESSION-001");
  });

  it("retourne 412 si le roster est absent", async () => {
    const base = createTempDir();
    const events = new EventEmitter();
    const store = new InMemoryNotificationStore();
    const orchestrator = new NotificationOrchestrator(store, SYSTEM_CLOCK);
    bindNotificationHooks({ events, orchestrator });
    const { notification } = await orchestrator.enqueue({ sessionId: "ALIAS-001", text: "Hello" });

    const container = {
      notificationEvents: events,
      notificationOrchestrator: orchestrator,
      rosterUpdater: new RosterUpdater(base),
      messagingLogger: new MessagingLogger(base),
      logService: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        init: async () => {},
        onLog: vi.fn(),
        getLogs: vi.fn(),
      },
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
      notificationStore: store,
      init: async () => {},
    } as unknown as Container;

    const app = express();
    app.use(bodyParser.json());
    app.use(createNotifyRouter(container, defaultSecurity));

    const response = await request(app)
      .post(`/api/notifications/${notification.id}/ack`)
      .send({
        sessionId: "SESSION-001",
        agentId: "agent-1",
        actionId: notification.actionId,
      });

    expect(response.status).toBe(412);
  });
});
