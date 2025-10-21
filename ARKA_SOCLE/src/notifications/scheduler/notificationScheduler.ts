import type { NotificationOrchestrator } from "../domain";
import type { NotificationStore, SessionNotification } from "../domain/sessionNotification";
import type { FailureAlertPort } from "../failureAlertPort";
import type { LogService } from "../../services/logService";

interface SchedulerOptions {
  intervalMs?: number;
  batchSize?: number;
}

export class NotificationScheduler {
  private timer: NodeJS.Timeout | null = null;
  private readonly intervalMs: number;
  private readonly batchSize: number;

  constructor(
    private readonly store: NotificationStore,
    private readonly orchestrator: NotificationOrchestrator,
    private readonly failureAlert: FailureAlertPort,
    private readonly logService: LogService,
    options?: SchedulerOptions,
  ) {
    this.intervalMs = Math.max(1_000, options?.intervalMs ?? 5_000);
    this.batchSize = Math.max(1, options?.batchSize ?? 10);
  }

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.executeCycle().catch((error) => {
        this.logService.warn(`notification.scheduler.error ${String(error)}`, "session-notify");
      });
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async executeCycle(): Promise<void> {
    const now = new Date();
    const due = await this.store.listDueForRetry(now);
    if (!due.length) {
      return;
    }
    const batch = due.slice(0, this.batchSize);
    for (const notification of batch) {
      await this.handleRetry(notification, now);
    }
  }

  private async handleRetry(notification: SessionNotification, now: Date): Promise<void> {
    try {
      const result = await this.orchestrator.retry({ deliveryId: notification.id, reason: "scheduler", requestedAt: now });
      if (result.status !== "queued") {
        await this.failureAlert.notify({
          deliveryId: result.id,
          sessionId: result.sessionId,
          reason: result.status === "failed" ? "max_attempts" : `status_${result.status}`,
        });
      }
      this.logService.info(
        `notification.retry delivery=${notification.id} session=${notification.sessionId} attempts=${result.attempts}`,
        "session-notify",
        notification.sessionId,
      );
    } catch (error) {
      await this.failureAlert.notify({ deliveryId: notification.id, sessionId: notification.sessionId, reason: String(error) });
    }
  }
}
