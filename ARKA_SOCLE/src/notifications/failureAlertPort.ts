import { LogService } from "../services/logService";
import { MessagingLogger } from "./messagingLogger";

interface FailureAlertParams {
  deliveryId: string;
  sessionId?: string;
  reason: string;
}

export class FailureAlertPort {
  constructor(
    private readonly logService: LogService,
    private readonly messagingLogger: MessagingLogger,
    private readonly target: string = "core-guardians",
  ) {}

  async notify(params: FailureAlertParams): Promise<void> {
    const sessionId = params.sessionId ?? "unknown";
    const timestamp = new Date().toISOString();
    const reason = params.reason?.trim() || "unspecified";
    this.logService.warn(
      `notification.alert delivery=${params.deliveryId} session=${sessionId} reason=${reason}`,
      "session-notify",
      params.sessionId,
    );
    const messageId = `msg-notify-alert-${params.deliveryId}-${Date.now()}`;
    await this.messagingLogger.append({
      ts: timestamp,
      type: "alert",
      message_id: messageId,
      subject: `Alerte notification ${params.deliveryId}`,
      from: "session-notify",
      to: this.target,
      notes: `session=${sessionId} reason=${reason}`,
    });
  }
}
