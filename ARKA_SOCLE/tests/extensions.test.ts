import { describe } from 'vitest';
import { beforeAll, afterAll, it, expect } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';
import { AddressInfo } from 'net';
import path from 'path';
import fs from 'fs-extra';
import { createContainer } from '../src/container';
import { createRoutes } from '../src/http/routes';

const TEST_DIR = path.join(process.cwd(), '.tmp-extensions');

describe('Extensions (Router/Fallback/Circuit)', () => {
  let request: supertest.SuperTest<supertest.Test>;
  let server: any;

  beforeAll(async () => {
    await fs.remove(TEST_DIR);
    const container = createContainer(TEST_DIR);
    await container.init();

    const app = express();
    app.use(bodyParser.json());
    app.use(createRoutes(container));

    server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    request = supertest(`http://127.0.0.1:${port}`);
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
    await fs.remove(TEST_DIR);
  });

  it('registers router strategy and dispatches round robin', async () => {
    await request
      .post('/api/router/strategy')
      .send({ moduleId: 'claude_provider', strategy: 'round_robin', targets: ['claude_provider', 'gpt_provider'] })
      .expect(204);

    const first = await request.post('/api/router/dispatch').send({ moduleId: 'claude_provider' }).expect(200);
    const second = await request.post('/api/router/dispatch').send({ moduleId: 'claude_provider' }).expect(200);

    expect(first.body.moduleId).toBe('claude_provider');
    expect(second.body.moduleId).toBe('gpt_provider');

    const status = await request.get('/api/router').expect(200);
    expect(status.body.modules['claude_provider']).toBeTruthy();
  });

  it('configures fallback chain and triggers fallback', async () => {
    await request
      .post('/api/fallback/chain')
      .send({ primaryId: 'claude_provider', fallbacks: ['gpt_provider', 'gemini_provider'] })
      .expect(204);

    await request
      .post('/api/fallback/trigger')
      .send({ moduleId: 'claude_provider', reason: 'integration-test' })
      .expect(202);

    const status = await request.get('/api/fallback/status').expect(200);
    const route = status.body.routes['claude_provider'];
    expect(route).toBeTruthy();
    expect(route.currentModuleId).toBe('gpt_provider');
    expect(status.body.metrics.totalFallbacks).toBeGreaterThan(0);
  });

  it('opens circuit after failure threshold and exposes status', async () => {
    await request
      .post('/api/circuit/config')
      .send({ moduleId: 'claude_provider', failureThreshold: 1, successThreshold: 1, timeoutMs: 1000 })
      .expect(204);

    await request
      .post('/api/circuit/failure')
      .send({ moduleId: 'claude_provider', reason: 'forced-failure' })
      .expect(202);

    const status = await request.get('/api/circuit/status').expect(200);
    const moduleStatus = status.body.modules.find((item: any) => item.moduleId === 'claude_provider');
    expect(moduleStatus).toBeTruthy();
    expect(moduleStatus.state).toBe('open');
    expect(moduleStatus.lastError).toBe('forced-failure');
  });
  it('provides advanced router metrics, cache and queue controls', async () => {
    await request
      .post('/api/router/strategy')
      .send({ moduleId: 'router_test', strategy: 'weighted', targets: ['router_test', 'router_backup'], weights: { router_test: 1, router_backup: 3 } })
      .expect(204);

    await request
      .post('/api/router/cache/config')
      .send({ moduleId: 'router_test', enabled: true, ttl: 5000, maxSize: 10, strategy: 'lru' })
      .expect(204);

    await request
      .post('/api/router/queue')
      .send({ moduleId: 'router_test', enabled: true, maxQueue: 5, priority: 'priority', timeout: 2000 })
      .expect(204);

    await request
      .post('/api/router/dispatch')
      .send({ moduleId: 'router_test', requestId: 'req-1', latencyMs: 10 })
      .expect(200);

    await request
      .post('/api/router/dispatch')
      .send({ moduleId: 'router_test', requestId: 'req-2', latencyMs: 20, priority: 5 })
      .expect(200);

    const metrics = await request.get('/api/router/metrics/router_test').expect(200);
    expect(metrics.body.calls).toBeGreaterThan(0);
    expect(metrics.body.averageLatencyMs).toBeGreaterThanOrEqual(0);

    const cache = await request.get('/api/router/cache').expect(200);
    expect(cache.body.hitRate).toBeDefined();

    const queue = await request.get('/api/router/queue/router_test').expect(200);
    expect(queue.body.priority).toBe('priority');
  });

  it('manages fallback thresholds and health checks via API', async () => {
    await request
      .post('/api/fallback/threshold')
      .send({ moduleId: 'router_test', threshold: { maxErrors: 1, timeWindow: 1000, action: 'fallback' } })
      .expect(204);

    const errorsBefore = await request.get('/api/fallback/errors/router_test').expect(200);
    expect(errorsBefore.body.count).toBe(0);

    await request
      .post('/api/fallback/health/start')
      .send({ moduleId: 'router_test', config: { interval: 1000, timeout: 500, retries: 1, failureThreshold: 1, successThreshold: 1 } })
      .expect(204);

    const health = await request
      .post('/api/fallback/health/force')
      .send({ moduleId: 'router_test' })
      .expect(200);
    expect(health.body.moduleId).toBe('router_test');

    await request
      .post('/api/fallback/health/stop')
      .send({ moduleId: 'router_test' })
      .expect(204);
  });

  it('exposes circuit configs, metrics and test endpoint', async () => {
    await request
      .post('/api/circuit/config')
      .send({ moduleId: 'router_test', failureThreshold: 2, successThreshold: 1, timeoutMs: 1000, halfOpenTimeout: 1000, resetTimeout: 2000 })
      .expect(204);

    const config = await request.get('/api/circuit/config/router_test').expect(200);
    expect(config.body.failureThreshold).toBe(2);

    await request
      .post('/api/circuit/failure')
      .send({ moduleId: 'router_test', reason: 'metric-test' })
      .expect(202);

    const metrics = await request.get('/api/circuit/metrics/router_test').expect(200);
    expect(metrics.body.failures).toBeGreaterThanOrEqual(1);

    const testResult = await request
      .post('/api/circuit/test')
      .send({ moduleId: 'router_test' })
      .expect(200);
    expect(testResult.body.ok).toBe(true);

    await request
      .post('/api/circuit/force-reset')
      .send({ moduleId: 'router_test' })
      .expect(204);
  });
});


