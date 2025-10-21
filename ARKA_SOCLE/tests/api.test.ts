import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { AddressInfo } from 'net';
import express from 'express';
import bodyParser from 'body-parser';
import { createContainer } from '../src/container';
import { createRoutes } from '../src/http/routes';
import path from 'path';
import fs from 'fs-extra';

const TEST_DIR = path.join(process.cwd(), '.tmp-tests');

describe('ARKA SOCLE API', () => {
  let request: supertest.SuperTest<supertest.Test>;
  let server: any;
  let container: ReturnType<typeof createContainer>;

  beforeAll(async () => {
    await fs.remove(TEST_DIR);
    container = createContainer(TEST_DIR);
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

  it('returns health info', async () => {
    const res = await request.get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('creates and retrieves sessions', async () => {
    const create = await request.post('/api/sessions').send({
      agentId: 'agp',
      profile: 'governance',
      provider: 'claude'
    });
    expect(create.status).toBe(201);

    const list = await request.get('/api/sessions');
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThan(0);

    const sessionId = list.body[0].id;
    const detail = await request.get(`/api/sessions/${sessionId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.id).toBe(sessionId);
  });

  it('handles context push/pull', async () => {
    const push = await request.put('/api/context').send({
      project: { id: 'PRJ-1', name: 'Arka Labs' }
    });
    expect(push.status).toBe(200);

    const get = await request.get('/api/context');
    expect(get.status).toBe(200);
    expect(get.body.project?.id).toBe('PRJ-1');
  });

  it('returns module list and allows enable/disable', async () => {
    const list = await request.get('/api/modules');
    expect(list.status).toBe(200);
    const moduleId = list.body[0].id;

    const disable = await request.post(`/api/modules/${moduleId}/disable`);
    expect(disable.status).toBe(204);

    const enable = await request.post(`/api/modules/${moduleId}/enable`);
    expect(enable.status).toBe(204);
  });

  it('exposes provider metrics', async () => {
    const res = await request.get('/api/providers/metrics');
    expect(res.status).toBe(200);
    expect(res.body.totalDispatches).toBe(0);
    expect(Array.isArray(res.body.providers)).toBe(true);
  });

  it('collects provider switch events via log service', async () => {
    container.logService.info('provider.switch claude -> gemini', 'test-suite', 'sess-metrics');
    const res = await request.get('/api/observability/provider-switch');
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
  });

  it('collects handoff events via log service', async () => {
    container.logService.info('handoff.created lead-dev -> pmo', 'test-suite', 'sess-handoff');
    const res = await request.get('/api/observability/handoffs');
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.kinds['handoff.created']).toBeGreaterThan(0);
  });

  it('accepts session notifications and records a log entry', async () => {
    const create = await request.post('/api/sessions').send({
      agentId: 'notif-agent',
      profile: 'core',
      provider: 'claude'
    });
    expect(create.status).toBe(201);
    const sessionId = create.body.id;

    const notify = await request.post(`/api/sessions/${sessionId}/notify`).send({ text: 'ok' });
    expect(notify.status).toBe(202);
    expect(notify.body).toMatchObject({
      status: 'queued',
      sessionId,
      payload: { type: 'notify', text: 'ok' }
    });

    const logs = await request.get('/api/logs').query({ session: sessionId });
    expect(logs.status).toBe(200);
    const found = (logs.body as any[]).some((entry) => typeof entry.message === 'string' && entry.message.includes('"type":"notify"'));
    expect(found).toBe(true);
  });
});
