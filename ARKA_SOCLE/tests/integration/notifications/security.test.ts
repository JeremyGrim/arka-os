import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';
import { AddressInfo } from 'net';
import path from 'path';
import fs from 'fs-extra';
import { createContainer } from '../../../src/container';
import { createRoutes } from '../../../src/http/routes';

const TEST_DIR = path.join(process.cwd(), '.tmp-tests-security');

const cleanupEnv = () => {
  delete process.env.SOCLE_NOTIFY_TOKEN;
  delete process.env.SOCLE_ENFORCE_TLS;
  delete process.env.SOCLE_ALLOW_INSECURE_HTTP;
  delete process.env.ARKA_SOCLE_ENV;
  delete process.env.ARKA_SOCLE_URL;
};

describe('Session notify security', () => {
  let server: any;

  beforeEach(async () => {
    cleanupEnv();
    await fs.remove(TEST_DIR);
  });

  afterEach(async () => {
    if (server) {
      server.close();
      server = undefined;
    }
    cleanupEnv();
    await fs.remove(TEST_DIR);
  });

  const bootstrap = async () => {
    const container = createContainer(TEST_DIR);
    await container.init();

    const app = express();
    app.use(bodyParser.json());
    app.use(createRoutes(container));

    server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    const request = supertest(`http://127.0.0.1:${port}`);

    return { request, container };
  };

  it('refuse la notification sans jeton valide', async () => {
    process.env.SOCLE_NOTIFY_TOKEN = 'super-secret';
    const { request, container } = await bootstrap();

    const session = await request.post('/api/sessions').send({
      agentId: 'sec-test',
      profile: 'core',
      provider: 'claude'
    });
    expect(session.status).toBe(201);
    const sessionId = session.body.id;

    const res = await request.post(`/api/sessions/${sessionId}/notify`).send({ text: 'ping' });
    expect(res.status).toBe(401);

    const logs = await request.get('/api/logs').query({ session: sessionId });
    expect(logs.status).toBe(200);
    const logged = (logs.body as any[]).some(
      (entry) => typeof entry.message === 'string' && entry.message.includes('auth_failed')
    );
    expect(logged).toBe(true);
  });

  it('accepte la notification avec jeton valide', async () => {
    process.env.SOCLE_NOTIFY_TOKEN = 'super-secret';
    const { request } = await bootstrap();

    const session = await request.post('/api/sessions').send({
      agentId: 'sec-accept',
      profile: 'core',
      provider: 'claude'
    });
    expect(session.status).toBe(201);
    const sessionId = session.body.id;

    const res = await request
      .post(`/api/sessions/${sessionId}/notify`)
      .set('Authorization', 'Bearer super-secret')
      .send({ text: 'hello' });

    expect([200, 202]).toContain(res.status);
    expect(res.body.sessionId).toBe(sessionId);
  });

  it('applique le rate limit à 5 notifications par minute', async () => {
    process.env.SOCLE_NOTIFY_TOKEN = 'rate-limit-token';
    const { request } = await bootstrap();

    const session = await request.post('/api/sessions').send({
      agentId: 'sec-rate',
      profile: 'core',
      provider: 'claude'
    });
    expect(session.status).toBe(201);
    const sessionId = session.body.id;

    for (let i = 0; i < 5; i += 1) {
      const res = await request
        .post(`/api/sessions/${sessionId}/notify`)
        .set('Authorization', 'Bearer rate-limit-token')
        .send({ text: `message-${i}` });
      expect([200, 202]).toContain(res.status);
    }

    const blocked = await request
      .post(`/api/sessions/${sessionId}/notify`)
      .set('Authorization', 'Bearer rate-limit-token')
      .send({ text: 'message-6' });
    expect(blocked.status).toBe(429);
  });

  it('bloque les requêtes non sécurisées quand TLS est requis', async () => {
    process.env.SOCLE_NOTIFY_TOKEN = 'tls-token';
    process.env.SOCLE_ENFORCE_TLS = 'true';
    process.env.ARKA_SOCLE_ENV = 'production';
    process.env.ARKA_SOCLE_URL = 'http://insecure-socle';

    const { request } = await bootstrap();

    const session = await request.post('/api/sessions').send({
      agentId: 'sec-tls',
      profile: 'core',
      provider: 'claude'
    });
    expect(session.status).toBe(201);
    const sessionId = session.body.id;

    const res = await request
      .post(`/api/sessions/${sessionId}/notify`)
      .set('Authorization', 'Bearer tls-token')
      .send({ text: 'tls check' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('canal non sécurisé');
  });
});
