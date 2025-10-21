import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NotificationDomainError,
  NotificationOrchestrator,
  NotificationStatus,
  SessionNotification,
  SYSTEM_CLOCK,
} from "../../../src/notifications/domain";
import { InMemoryNotificationStore } from "../../../src/notifications/store";

describe("NotificationOrchestrator", () => {
  let store: InMemoryNotificationStore;
  let orchestrator: NotificationOrchestrator;

  beforeEach(() => {
    store = new InMemoryNotificationStore({ ttlMs: 60_000 });
    orchestrator = new NotificationOrchestrator(store, SYSTEM_CLOCK);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("enqueue crée une notification queued avec SLA par défaut", async () => {
    const { notification, isNew } = await orchestrator.enqueue({
      sessionId: "sess-001",
      text: "Wake up agent!",
    });
    expect(isNew).toBe(true);
    expect(notification.status).toBe<NotificationStatus>("queued");
    expect(notification.slaExpiresAt > notification.queuedAt).toBe(true);

    const stored = await store.getById(notification.id);
    expect(stored?.status).toBe("queued");
  });

  it("enqueue réutilise la notification existante quand deliveryId fourni", async () => {
    const { notification } = await orchestrator.enqueue({
      sessionId: "sess-001",
      text: "Wake up agent!",
      deliveryId: "notif-1",
    });
    const result = await orchestrator.enqueue({
      sessionId: "sess-001",
      text: "Wake up agent!",
      deliveryId: notification.id,
    });
    expect(result.isNew).toBe(false);
    expect(result.notification.id).toBe(notification.id);
  });

  it("markDelivered fait passer la notification à delivered avec horodatage", async () => {
    const { notification } = await orchestrator.enqueue({
      sessionId: "sess-001",
      text: "Wake up agent!",
    });
    const updated = await orchestrator.markDelivered({ deliveryId: notification.id });
    expect(updated.status).toBe<NotificationStatus>("delivered");
    expect(updated.deliveredAt).toBeDefined();
  });

  it("ack passe l’état à acked et nettoie retryAfter", async () => {
    const { notification } = await orchestrator.enqueue({
      sessionId: "sess-001",
      text: "Wake up agent!",
    });
    await orchestrator.markDelivered({ deliveryId: notification.id });
    const acked = await orchestrator.ack({ deliveryId: notification.id });
    expect(acked.status).toBe<NotificationStatus>("acked");
    expect(acked.retryAfter).toBeUndefined();
    expect(acked.ackedAt).toBeDefined();
  });

  it("retry incrémente attempts et planifie un retryAfter", async () => {
    const { notification } = await orchestrator.enqueue({
      sessionId: "sess-001",
      text: "Wake up agent!",
    });
    const retried = await orchestrator.retry({ deliveryId: notification.id, reason: "socket_closed" });
    expect(retried.attempts).toBe(1);
    expect(retried.retryAfter).toBeDefined();
    expect(retried.status).toBe<NotificationStatus>("queued");
  });

  it("retry bascule en failed dès que maxAttempts atteints", async () => {
    const { notification } = await orchestrator.enqueue({
      sessionId: "sess-001",
      text: "Wake up agent!",
      maxAttempts: 2,
    });
    const first = await orchestrator.retry({ deliveryId: notification.id, reason: "no_ws" });
    expect(first.status).toBe("queued");
    const second = await orchestrator.retry({ deliveryId: notification.id, reason: "no_ws" });
    expect(second.status).toBe<NotificationStatus>("failed");
    expect(second.failedAt).toBeDefined();
  });

  it("lève une erreur si ack impossible sur notification manquante", async () => {
    await expect(orchestrator.ack({ deliveryId: "unknown" })).rejects.toThrow(NotificationDomainError);
  });

  it("store in-memory expire les notifications après TTL", async () => {
    vi.useFakeTimers();
    const expired: SessionNotification[] = [];
    const ttlStore = new InMemoryNotificationStore({
      ttlMs: 1000,
      onExpire: (notif) => expired.push(notif),
    });
    const ttlOrchestrator = new NotificationOrchestrator(ttlStore, SYSTEM_CLOCK);
    const { notification } = await ttlOrchestrator.enqueue({
      sessionId: "sess-ttl",
      text: "Ping",
    });
    vi.advanceTimersByTime(1200);
    const found = await ttlStore.getById(notification.id);
    expect(found).toBeUndefined();
    expect(expired).toHaveLength(1);
    expect(expired[0].id).toBe(notification.id);
  });
});
