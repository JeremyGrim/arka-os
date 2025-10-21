import type { Request, Response, Router, NextFunction } from "express";
import express from "express";

import { Container } from "../container";
import { NotificationDomainError } from "../notifications/domain";
import { RosterUnavailableError } from "../notifications/rosterUpdater";
import type { SecurityConfig } from "../config/security";
import { createAuthMiddleware } from "../middleware/auth";
import { createRateLimitMiddleware } from "../middleware/rateLimit";

const SESSION_NOTIFY_LOG_SOURCE = "session-notify";

interface NotifyRequestBody {
  text?: string;
  actionId?: string;
  metadata?: Record<string, unknown>;
  deliveryId?: string;
  slaSeconds?: number;
}

interface AckRequestBody {
  sessionId?: string;
  agentId?: string;
  actionId?: string;
  receivedAt?: string;
}

const isSecureRequest = (req: Request): boolean => {
  if (req.secure) {
    return true;
  }
  const forwarded = req.headers["x-forwarded-proto"];
  if (!forwarded) {
    return false;
  }
  if (Array.isArray(forwarded)) {
    return forwarded.some((value) => value?.toLowerCase().includes("https"));
  }
  return forwarded.toLowerCase().includes("https");
};

const createTlsEnforcementMiddleware =
  (container: Container, security: SecurityConfig) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!security.requireTls) {
      next();
      return;
    }
    if (isSecureRequest(req)) {
      next();
      return;
    }
    container.logService.warn(
      `tls_blocked route=${req.method} ${req.originalUrl} env=${security.environment}`,
      SESSION_NOTIFY_LOG_SOURCE,
    );
    res.status(403).json({ error: "canal non sécurisé" });
  };

export function createNotifyRouter(container: Container, security: SecurityConfig): Router {
  const router = express.Router();
  const authMiddleware = createAuthMiddleware(container.logService, security);
  const rateLimitMiddleware = createRateLimitMiddleware(container.logService, security.rateLimit);
  const tlsMiddleware = createTlsEnforcementMiddleware(container, security);

  router.post("/api/sessions/:sessionId/notify", tlsMiddleware, authMiddleware, rateLimitMiddleware, async (req: Request<{ sessionId: string }, unknown, NotifyRequestBody>, res: Response) => {
    const sessionId = req.params.sessionId?.trim();
    const { text, actionId, metadata, deliveryId, slaSeconds } = req.body ?? {};

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId requis" });
    }
    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "text requis" });
    }

    try {
      const { notification, isNew } = await container.notificationOrchestrator.enqueue({
        sessionId,
        text,
        actionId,
        metadata,
        deliveryId,
        slaSeconds,
      });

      if (isNew) {
        const payloadDescriptor = JSON.stringify({ type: "notify", text, metadata: metadata ?? null });
        container.logService.info(
          `notification.queued delivery=${notification.id} session=${sessionId} action=${notification.actionId ?? "auto"} payload=${payloadDescriptor}`,
          SESSION_NOTIFY_LOG_SOURCE,
          sessionId,
        );
      }

      res.status(isNew ? 202 : 200).json({
        status: "queued",
        deliveryId: notification.id,
        actionId: notification.actionId,
        attempts: notification.attempts,
        isNew,
        sessionId,
        payload: {
          type: "notify",
          text,
          metadata: metadata ?? null,
        },
      });
    } catch (error) {
      if (error instanceof NotificationDomainError) {
        return res.status(400).json({ error: error.message });
      }
      container.logService.error(error instanceof Error ? error.message : String(error), SESSION_NOTIFY_LOG_SOURCE);
      return res.status(500).json({ error: "Notification enqueue failed" });
    }
  });

  router.post("/api/notifications/:deliveryId/ack", tlsMiddleware, authMiddleware, async (req: Request<{ deliveryId: string }, unknown, AckRequestBody>, res: Response) => {
    const deliveryId = req.params.deliveryId?.trim();
    const { sessionId, agentId, actionId, receivedAt } = req.body ?? {};

    if (!deliveryId) {
      return res.status(400).json({ error: "deliveryId requis" });
    }
    if (typeof sessionId !== "string" || !sessionId.trim()) {
      return res.status(400).json({ error: "sessionId requis" });
    }
    if (typeof agentId !== "string" || !agentId.trim()) {
      return res.status(400).json({ error: "agentId requis" });
    }
    if (typeof actionId !== "string" || !actionId.trim()) {
      return res.status(400).json({ error: "actionId requis" });
    }

    let ackedAt: Date;
    if (receivedAt) {
      const parsed = new Date(receivedAt);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ error: "receivedAt invalide" });
      }
      ackedAt = parsed;
    } else {
      ackedAt = new Date();
    }

    try {
      const notification = await container.notificationOrchestrator.ack({ deliveryId, ackedAt });
      if (notification.actionId && notification.actionId !== actionId.trim()) {
        return res.status(409).json({ error: "actionId incohérent" });
      }
      const ackIso = ackedAt.toISOString();
      await container.rosterUpdater.applyAck({ agentId: agentId.trim(), sessionId: sessionId.trim(), ackedAt: ackIso });
      await container.messagingLogger.logAck({
        deliveryId,
        sessionId: sessionId.trim(),
        actionId: actionId.trim(),
        ackedAt: ackIso,
        actor: agentId.trim(),
      });
      container.logService.info(`notification.ack delivery=${deliveryId} session=${sessionId.trim()} action=${actionId.trim()}`, SESSION_NOTIFY_LOG_SOURCE, sessionId.trim());
      res.status(200).json({
        status: notification.status,
        deliveryId: notification.id,
        actionId: notification.actionId,
        ackedAt: notification.ackedAt,
      });
    } catch (error) {
      if (error instanceof RosterUnavailableError) {
        return res.status(412).json({ error: `Roster indisponible (${error.rosterPath})` });
      }
      if (error instanceof NotificationDomainError) {
        return res.status(400).json({ error: error.message });
      }
      container.logService.error(error instanceof Error ? error.message : String(error), SESSION_NOTIFY_LOG_SOURCE);
      return res.status(500).json({ error: "Ack failed" });
    }
  });

  return router;
}
