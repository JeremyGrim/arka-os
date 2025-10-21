import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotificationScheduler } from "../../../src/notifications/scheduler/notificationScheduler";
import type { NotificationOrchestrator } from "../../../src/notifications/domain";
import type { NotificationStore, SessionNotification } from "../../../src/notifications/domain/sessionNotification";
import { FailureAlertPort } from "../../../src/notifications/failureAlertPort";

class FakeStore implements NotificationStore {
  constructor(private readonly notifications: SessionNotification[] = []) {}

  async insert(): Promise<void> {}
  async update(): Promise<void> {}
  async getById(): Promise<SessionNotification | undefined> {
    return undefined;
  }
  async listDueForRetry(reference: Date): Promise<SessionNotification[]> {
    return this.notifications.filter((notif) => {
      if (notif.status !== "queued" || !notif.retryAfter) {
        return false;
      }
      return Date.parse(notif.retryAfter) <= reference.getTime();
    });
  }
}

describe("NotificationScheduler", () => {
  let orchestrator: NotificationOrchestrator;
  let failureAlert: FailureAlertPort;
  let logService: any;

  beforeEach(() => {
    orchestrator = {
      retry: vi.fn(async ({ deliveryId }) => ({
        id: deliveryId,
        status: "queued",
        attempts: 1,
      } as any)),
    } as unknown as NotificationOrchestrator;
    logService = {
      info: vi.fn(),
      warn: vi.fn(),
    };
    const messagingLogger = { append: vi.fn().mockResolvedValue(undefined) };
    failureAlert = new FailureAlertPort(logService as any, messagingLogger as any);
  });

  it("relance les notifications dues", async () => {
    const notification: SessionNotification = {
      id: "notif-1",
      sessionId: "sess-1",
      actionId: "action-1",
      status: "queued",
      attempts: 1,
      maxAttempts: 3,
      payload: { text: "Hello" },
      queuedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      slaExpiresAt: new Date().toISOString(),
      retryAfter: new Date(Date.now() - 1000).toISOString(),
    };
    const store = new FakeStore([notification]);
    const scheduler = new NotificationScheduler(store, orchestrator, failureAlert, logService as any, { intervalMs: 50, batchSize: 1 });

    const execute = (scheduler as any).executeCycle as () => Promise<void>;
    await execute.call(scheduler);

    expect((orchestrator.retry as any)).toHaveBeenCalledWith(expect.objectContaining({ deliveryId: "notif-1" }));
    expect(logService.info).toHaveBeenCalledWith(expect.stringContaining("notification.retry"), "session-notify", "sess-1");
  });
});
