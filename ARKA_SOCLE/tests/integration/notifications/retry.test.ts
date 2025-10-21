import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationOrchestrator, SYSTEM_CLOCK } from "../../../src/notifications/domain";
import { InMemoryNotificationStore } from "../../../src/notifications/store";
import { FailureAlertPort } from "../../../src/notifications/failureAlertPort";
import { NotificationScheduler } from "../../../src/notifications/scheduler/notificationScheduler";

describe("Notification retry scheduler", () => {
  let logInfo: ReturnType<typeof vi.fn>;
  let logWarn: ReturnType<typeof vi.fn>;
  let logService: any;
  let messagingLogger: { append: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    logInfo = vi.fn();
    logWarn = vi.fn();
    messagingLogger = { append: vi.fn().mockResolvedValue(undefined) };
    logService = {
      info: logInfo,
      warn: logWarn,
      error: vi.fn(),
      debug: vi.fn(),
      onLog: vi.fn(),
      init: vi.fn(),
      getLogs: vi.fn().mockReturnValue([]),
    };
  });

  it("marque la notification en échec et émet une alerte unique quand le max d'essais est atteint", async () => {
    const store = new InMemoryNotificationStore();
    const orchestrator = new NotificationOrchestrator(store, SYSTEM_CLOCK, { maxAttempts: 1 });
    const failureAlert = new FailureAlertPort(logService, messagingLogger as any);
    const scheduler = new NotificationScheduler(store, orchestrator, failureAlert, logService, { intervalMs: 50, batchSize: 1 });

    await orchestrator.enqueue({
      sessionId: "SESSION-X",
      text: "initial payload",
      deliveryId: "delivery-1",
      actionId: "action-123",
      slaSeconds: 1,
    });

    const stored = await store.getById("delivery-1");
    expect(stored).toBeDefined();
    await scheduler["handleRetry"](stored!, new Date());

    const updated = await store.getById("delivery-1");
    expect(updated?.status).toBe("failed");
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining("notification.retry"), "session-notify", "SESSION-X");
    expect(logWarn).toHaveBeenCalledTimes(1);
    expect(logWarn).toHaveBeenCalledWith(
      expect.stringContaining("notification.alert"),
      "session-notify",
      "SESSION-X",
    );
    expect(messagingLogger.append).toHaveBeenCalledTimes(1);
    expect(messagingLogger.append.mock.calls[0][0]).toMatchObject({
      type: "alert",
      from: "session-notify",
      to: "core-guardians",
    });
  });
});
