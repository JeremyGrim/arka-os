import { Router } from 'express';
import { Container } from '../container';
import { SocleState } from '../types';
import type { MetaFileType } from '../core/metaEngine';
import { createNotifyRouter } from './notify';
import { createSseRouter } from '../server/sse';
import { loadSecurityConfig } from '../config/security';

interface RoutesOptions {
  allowedOrigins?: string[];
}

export const createRoutes = (container: Container, options: RoutesOptions = {}): Router => {
  const router = Router();
  const startedAt = Date.now();
  const security = loadSecurityConfig(container.configService);

  if (security.requireTls && security.socleUrl && security.socleUrl.startsWith('http://')) {
    container.logService.warn(
      `tls_require_https url=${security.socleUrl} env=${security.environment}`,
      'session-notify'
    );
  } else if (!security.requireTls && security.socleUrl && security.socleUrl.startsWith('http://')) {
    container.logService.warn(
      `tls_warning_insecure url=${security.socleUrl} env=${security.environment}`,
      'session-notify'
    );
  }

  router.use(createNotifyRouter(container, security));
  router.use(createSseRouter(container.notificationEvents, { allowedOrigins: options.allowedOrigins }));

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', startedAt });
  });

  router.get('/api/socle/state', async (_req, res) => {
    const context = container.contextSync.getContext();
    const state: SocleState = {
      version: '0.1-d_beta',
      status: 'ready',
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      context
    };
    await container.persistence.saveState(state);
    res.json(state);
  });

  router.post('/api/socle/init', async (_req, res) => {
    await container.moduleManager.init();
    res.status(204).send();
  });

  router.get('/api/modules', (_req, res) => {
    res.json(container.moduleManager.list());
  });

  router.get('/api/modules/health', (_req, res) => {
    res.json(container.moduleManager.listHealth());
  });

  router.post('/api/modules/:id/enable', async (req, res) => {
    await container.moduleManager.setEnabled(req.params.id, true);
    res.status(204).send();
  });

  router.post('/api/modules/:id/disable', async (req, res) => {
    await container.moduleManager.setEnabled(req.params.id, false);
    res.status(204).send();
  });

  // Router advanced endpoints
  router.get('/api/router', (_req, res) => {
    res.json(container.routerService.getStatus());
  });

  router.post('/api/router/strategy', (req, res) => {
    const { moduleId, strategy, targets = [], weights } = req.body ?? {};
    container.routerService.setStrategy(moduleId, strategy, targets, weights);
    res.status(204).send();
  });

  router.post('/api/router/load-balancing', (req, res) => {
    const { moduleId, strategy } = req.body ?? {};
    container.routerService.setLoadBalancingStrategy(moduleId, strategy);
    res.status(204).send();
  });

  router.post('/api/router/routing', (req, res) => {
    const { moduleId, strategy } = req.body ?? {};
    container.routerService.setRoutingStrategy(moduleId, strategy);
    res.status(204).send();
  });

  router.post('/api/router/cache', (req, res) => {
    const { enabled = true, ttl = 60_000 } = req.body ?? {};
    container.routerService.updateCacheConfig({ enabled, ttl, maxSize: req.body?.maxSize, strategy: req.body?.strategy });
    res.status(204).send();
  });

  router.post('/api/router/cache/config', (req, res) => {
    const { moduleId, enabled, ttl, maxSize, strategy } = req.body ?? {};
    container.routerService.enableCache(moduleId, { enabled, ttl, maxSize, strategy });
    res.status(204).send();
  });

  router.post('/api/router/cache/invalidate', (req, res) => {
    const { moduleId, pattern } = req.body ?? {};
    container.routerService.invalidateCache(moduleId, pattern);
    res.status(204).send();
  });

  router.get('/api/router/cache', (req, res) => {
    res.json(container.routerService.getCacheStats(req.query.moduleId as string | undefined));
  });

  router.post('/api/router/queue', (req, res) => {
    const { moduleId, enabled = true, maxQueue = 100, priority, timeout } = req.body ?? {};
    container.routerService.updateQueueConfig(moduleId, { enabled, maxQueue, priority, timeout });
    res.status(204).send();
  });

  router.get('/api/router/queue', (_req, res) => {
    res.json(container.routerService.getQueueStatus());
  });

  router.get('/api/router/queue/:moduleId', (req, res) => {
    res.json(container.routerService.getQueueStatus(req.params.moduleId));
  });

  router.post('/api/router/queue/prioritize', (req, res) => {
    const { moduleId, requestId } = req.body ?? {};
    container.routerService.prioritizeRequest(moduleId, requestId);
    res.status(204).send();
  });

  router.post('/api/router/instances/register', (req, res) => {
    container.routerService.registerInstance(req.body?.moduleId, req.body?.instance);
    res.status(204).send();
  });

  router.post('/api/router/instances/unregister', (req, res) => {
    container.routerService.unregisterInstance(req.body?.moduleId, req.body?.instanceId);
    res.status(204).send();
  });

  router.post('/api/router/dispatch', (req, res) => {
    const { moduleId, payload } = req.body ?? {};
    const result = container.routerService.dispatch(moduleId, payload);
    res.json(result);
  });

  router.get('/api/router/metrics/:moduleId', (req, res) => {
    res.json(container.routerService.getLoadMetrics(req.params.moduleId));
  });

  router.get('/api/providers/metrics', (_req, res) => {
    res.json(container.providerMetrics.getSnapshot());
  });

  router.get('/api/observability/provider-switch', (_req, res) => {
    res.json(container.observability.getProviderSwitchSummary());
  });

  router.get('/api/observability/handoffs', (_req, res) => {
    res.json(container.observability.getHandoffSummary());
  });

  router.get('/api/observability/notifications', (_req, res) => {
    res.json(container.observability.getNotificationSummary());
  });

  // Fallback engine endpoints
  router.get('/api/fallback/status', (_req, res) => {
    res.json(container.fallbackEngine.getStatus());
  });

  router.post('/api/fallback/chain', (req, res) => {
    const { primaryId, fallbacks = [] } = req.body ?? {};
    container.fallbackEngine.registerFallbackChain(primaryId, fallbacks);
    res.status(204).send();
  });

  router.post('/api/fallback/register', (req, res) => {
    const { primaryId, fallbackId } = req.body ?? {};
    container.fallbackEngine.registerFallback(primaryId, fallbackId);
    res.status(204).send();
  });

  router.post('/api/fallback/remove', (req, res) => {
    const { primaryId } = req.body ?? {};
    container.fallbackEngine.removeFallback(primaryId);
    res.status(204).send();
  });

  router.post('/api/fallback/threshold', (req, res) => {
    const { moduleId, threshold } = req.body ?? {};
    container.fallbackEngine.setErrorThreshold(moduleId, threshold);
    res.status(204).send();
  });

  router.get('/api/fallback/errors/:moduleId', (req, res) => {
    const timeWindow = Number(req.query.window ?? 60_000);
    res.json({ count: container.fallbackEngine.getErrorCount(req.params.moduleId, timeWindow) });
  });

  router.post('/api/fallback/trigger', async (req, res) => {
    const { moduleId, reason = 'manual-trigger' } = req.body ?? {};
    await container.fallbackEngine.triggerFallback(moduleId, reason);
    res.status(202).send();
  });

  router.post('/api/fallback/recover', async (req, res) => {
    const { moduleId } = req.body ?? {};
    const result = await container.fallbackEngine.attemptRecovery(moduleId);
    res.json(result);
  });

  router.post('/api/fallback/recovery/strategy', (req, res) => {
    const { moduleId, strategy } = req.body ?? {};
    container.fallbackEngine.setRecoveryStrategy(moduleId, strategy);
    res.status(204).send();
  });

  router.post('/api/fallback/recovery/schedule', (req, res) => {
    const { moduleId, delayMs, strategy } = req.body ?? {};
    container.fallbackEngine.scheduleRecoveryAttempt(moduleId, delayMs ?? 5_000, strategy);
    res.status(202).send();
  });

  router.post('/api/fallback/health/start', (req, res) => {
    const { moduleId, config } = req.body ?? {};
    container.fallbackEngine.startHealthCheck(moduleId, config);
    res.status(204).send();
  });

  router.post('/api/fallback/health/stop', (req, res) => {
    const { moduleId } = req.body ?? {};
    container.fallbackEngine.stopHealthCheck(moduleId);
    res.status(204).send();
  });

  router.post('/api/fallback/health/force', async (req, res) => {
    const { moduleId } = req.body ?? {};
    const status = await container.fallbackEngine.forceHealthCheck(moduleId);
    res.json(status);
  });

  // Circuit breaker endpoints
  router.get('/api/circuit/status', (_req, res) => {
    res.json(container.circuitBreaker.getStatus());
  });

  router.get('/api/circuit/state/:moduleId', (req, res) => {
    res.json({ state: container.circuitBreaker.getState(req.params.moduleId) });
  });

  router.get('/api/circuit/config/:moduleId', (req, res) => {
    res.json(container.circuitBreaker.getConfig(req.params.moduleId));
  });

  router.get('/api/circuit/metrics/:moduleId', (req, res) => {
    res.json(container.circuitBreaker.getMetrics(req.params.moduleId));
  });

  router.post('/api/circuit/config', (req, res) => {
    const { moduleId, failureThreshold, successThreshold, timeoutMs, halfOpenTimeout, resetTimeout } = req.body ?? {};
    container.circuitBreaker.configure(moduleId, { failureThreshold, successThreshold, timeoutMs, halfOpenTimeout, resetTimeout });
    res.status(204).send();
  });

  router.post('/api/circuit/reset', (req, res) => {
    const { moduleId } = req.body ?? {};
    container.circuitBreaker.reset(moduleId);
    res.status(204).send();
  });

  router.post('/api/circuit/force-reset', (req, res) => {
    const { moduleId } = req.body ?? {};
    container.circuitBreaker.forceReset(moduleId);
    res.status(204).send();
  });

  router.post('/api/circuit/half-open', (req, res) => {
    const { moduleId } = req.body ?? {};
    container.circuitBreaker.halfOpen(moduleId);
    res.status(204).send();
  });

  router.post('/api/circuit/failure', (req, res) => {
    const { moduleId, reason = 'manual-failure' } = req.body ?? {};
    container.circuitBreaker.recordFailure(moduleId, reason);
    res.status(202).send();
  });

  router.post('/api/circuit/success', (req, res) => {
    const { moduleId } = req.body ?? {};
    container.circuitBreaker.recordSuccess(moduleId);
    res.status(202).send();
  });

  router.post('/api/circuit/open', (req, res) => {
    const { moduleId, reason = 'manual-open' } = req.body ?? {};
    container.circuitBreaker.open(moduleId, reason);
    res.status(202).send();
  });

  router.post('/api/circuit/close', (req, res) => {
    const { moduleId } = req.body ?? {};
    container.circuitBreaker.close(moduleId);
    res.status(202).send();
  });

  router.post('/api/circuit/test', async (req, res) => {
    const ok = await container.circuitBreaker.testConnection(req.body?.moduleId);
    res.json({ ok });
  });

  // Sessions endpoints
  router.post('/api/sessions', async (req, res) => {
    const session = await container.sessionOrchestrator.createSession(req.body);
    container.logService.info(`Session ${session.id} created`, 'sessions', session.id);
    res.status(201).json(session);
  });

  router.get('/api/sessions', (_req, res) => {
    res.json(container.sessionOrchestrator.listSessions());
  });

  router.get('/api/sessions/:id', (req, res) => {
    res.json(container.sessionOrchestrator.getSession(req.params.id));
  });

  router.delete('/api/sessions/:id', async (req, res) => {
    await container.sessionOrchestrator.destroySession(req.params.id);
    container.logService.info(`Session ${req.params.id} destroyed`, 'sessions', req.params.id);
    res.status(204).send();
  });

  router.post('/api/sessions/:id/terminal', async (req, res) => {
    const terminalId = Number(req.body.terminalId);
    await container.sessionOrchestrator.assignTerminal(req.params.id, terminalId);
    res.status(204).send();
  });

  router.post('/api/sessions/:id/notify', (req, res) => {
    const sessionId = req.params.id;
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';

    if (!text) {
      return res.status(400).json({ error: 'Notification text is required' });
    }

    if (text.length > 256) {
      return res.status(413).json({ error: 'Notification text exceeds 256 characters' });
    }

    try {
      container.sessionOrchestrator.getSession(sessionId);
    } catch {
      return res.status(404).json({ error: `Session ${sessionId} not found` });
    }

    const payload = {
      type: 'notify' as const,
      text
    };

    container.logService.info(`notify ${JSON.stringify(payload)}`, 'session-notify', sessionId);
    res.status(202).json({
      status: 'queued',
      sessionId,
      payload
    });
  });

  router.post('/api/sessions/validate', (req, res) => {
    if (!req.body?.agentId || !req.body?.profile || !req.body?.provider) {
      return res.status(422).json({
        valid: false,
        errors: ['agentId, profile et provider sont requis']
      });
    }
    res.json({ valid: true });
  });

  // Meta endpoints
  router.post('/api/meta/files', async (req, res) => {
    const record = await container.metaEngine.saveFile({
      sessionId: req.body.sessionId,
      name: req.body.name,
      type: req.body.type,
      content: req.body.content,
      tags: req.body.tags,
      metadata: req.body.metadata
    });
    container.logService.info(`Fichier ${record.id} sauvegardé`, 'meta', record.sessionId);
    res.status(201).json(record);
  });

  router.get('/api/meta/files', (req, res) => {
    res.json(container.metaEngine.listFiles({
      sessionId: req.query.sessionId as string | undefined,
      type: req.query.type as MetaFileType | undefined
    }));
  });

  router.get('/api/meta/search', (req, res) => {
    res.json(container.metaEngine.searchByTag(req.query.tag as string));
  });

  // Context endpoints
  router.get('/api/context', (_req, res) => {
    res.json(container.contextSync.getContext());
  });

  router.put('/api/context', async (req, res) => {
    const updated = await container.contextSync.updateContext(req.body ?? {});
    res.json(updated);
  });

  router.get('/api/context/version', (_req, res) => {
    res.json({ version: container.contextSync.getVersion() });
  });

  // Config endpoints
  router.get('/api/config', (req, res) => {
    const key = req.query.key as string | undefined;
    res.json(container.configService.get(key));
  });

  router.put('/api/config', async (req, res) => {
    await container.configService.set(req.body.key, req.body.value);
    res.status(204).send();
  });

  router.delete('/api/config', async (req, res) => {
    await container.configService.reset(req.body?.keys);
    res.status(204).send();
  });

  router.post('/api/config/validate', (_req, res) => {
    const report = container.validationCore.validateConfiguration();
    res.json(report);
  });

  // Reporting & diagnostics
  router.get('/api/reports/state', (_req, res) => {
    const state = {
      generatedAt: new Date().toISOString(),
      environment: container.configService.get('socle.environment') ?? 'development',
      socle: {
        version: '0.1-d_beta',
        status: 'ready' as const
      },
      modules: container.moduleManager.list(),
      sessions: container.sessionOrchestrator.listSessions(),
      context: container.contextSync.getContext()
    };
    res.json(state);
  });

  router.get('/api/recovery', (_req, res) => {
    res.json(container.recovery.getStatus());
  });

  router.post('/api/recovery/trigger', (req, res) => {
    container.recovery.trigger(req.body?.moduleId, req.body?.strategy);
    res.status(202).send();
  });

  router.get('/api/diagnostics', (_req, res) => {
    res.json(container.diagnostics.run());
  });

  // Logs endpoints
  router.get('/api/logs', (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const level = req.query.level as any;
    const sessionId = req.query.session as string | undefined;
    const logs = container.logService.getLogs(limit, level, sessionId);
    res.json(logs);
  });

  router.get('/api/logs/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const level = req.query.level as any;
    const sessionId = req.query.session as string | undefined;
    const logs = container.logService.getLogs(limit, level, sessionId);
    logs.forEach((log) => {
      res.write(`${JSON.stringify(log)}\n`);
    });
    res.end();
  });

  return router;
};
