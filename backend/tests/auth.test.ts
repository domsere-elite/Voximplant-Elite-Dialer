import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    agentMapping: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('../src/lib/redis.js', () => ({
  redis: {
    ping: vi.fn().mockResolvedValue('PONG'),
    quit: vi.fn().mockResolvedValue('OK'),
    duplicate: vi.fn().mockReturnValue({
      status: 'ready',
      connect: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue('OK'),
      on: vi.fn(),
    }),
    on: vi.fn(),
  },
}));

vi.mock('../src/lib/crm-client.js', () => ({
  crmClient: {
    verifyLogin: vi.fn(),
  },
  CRMClient: class {},
}));

vi.mock('../src/services/voximplant-api.js', () => ({
  voximplantAPI: {
    init: vi.fn().mockResolvedValue(undefined),
    createOneTimeLoginKey: vi.fn().mockResolvedValue('test-otk'),
  },
}));

import { buildServer } from '../src/index.js';
import { registerAuthRoutes } from '../src/routes/auth.js';
import { authenticate, requireRole } from '../src/middleware/auth.js';
import { crmClient } from '../src/lib/crm-client.js';
import { prisma } from '../src/lib/prisma.js';
import type { FastifyInstance } from 'fastify';

describe('auth routes + middleware', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await registerAuthRoutes(app);
    app.get('/protected', { preHandler: authenticate }, async (req) => ({ user: req.user }));
    app.get('/admin-only', {
      preHandler: [authenticate, requireRole(['admin'])],
    }, async () => ({ ok: true }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('login with valid creds returns JWT + user + voximplantUser', async () => {
    (crmClient.verifyLogin as any).mockResolvedValue({ id: 'u-1', email: 'a@b.com', role: 'rep' });
    (prisma.agentMapping.findUnique as any).mockResolvedValue({
      id: 'am-1',
      crmUserId: 'u-1',
      voximplantUserId: 42,
      voximplantUsername: 'agent1@app.acct.voximplant.com',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'a@b.com', password: 'pw' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeTruthy();
    expect(body.user.id).toBe('u-1');
    expect(body.voximplantUser.username).toBe('agent1@app.acct.voximplant.com');
    expect(body.voximplantUser.oneTimeKey).toBe('test-otk');
  });

  it('login with invalid creds returns 401', async () => {
    (crmClient.verifyLogin as any).mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'a@b.com', password: 'bad' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('login with missing agent mapping returns 403', async () => {
    (crmClient.verifyLogin as any).mockResolvedValue({ id: 'u-1', email: 'a@b.com', role: 'rep' });
    (prisma.agentMapping.findUnique as any).mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'a@b.com', password: 'pw' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('protected route without header returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/protected' });
    expect(res.statusCode).toBe(401);
  });

  it('protected route with invalid token returns 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer garbage' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('protected route with valid token returns user', async () => {
    (crmClient.verifyLogin as any).mockResolvedValue({ id: 'u-1', email: 'a@b.com', role: 'rep' });
    (prisma.agentMapping.findUnique as any).mockResolvedValue({
      id: 'am-1', crmUserId: 'u-1', voximplantUserId: 42, voximplantUsername: 'agent1',
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'a@b.com', password: 'pw' },
    });
    const { token } = login.json();
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.id).toBe('u-1');
  });

  it('admin-only route rejects rep with 403', async () => {
    (crmClient.verifyLogin as any).mockResolvedValue({ id: 'u-1', email: 'a@b.com', role: 'rep' });
    (prisma.agentMapping.findUnique as any).mockResolvedValue({
      id: 'am-1', crmUserId: 'u-1', voximplantUserId: 42, voximplantUsername: 'agent1',
    });
    const login = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { email: 'a@b.com', password: 'pw' },
    });
    const { token } = login.json();
    const res = await app.inject({
      method: 'GET',
      url: '/admin-only',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('logout updates agent mapping to OFFLINE', async () => {
    (crmClient.verifyLogin as any).mockResolvedValue({ id: 'u-1', email: 'a@b.com', role: 'rep' });
    (prisma.agentMapping.findUnique as any).mockResolvedValue({
      id: 'am-1', crmUserId: 'u-1', voximplantUserId: 42, voximplantUsername: 'agent1',
    });
    const login = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { email: 'a@b.com', password: 'pw' },
    });
    const { token } = login.json();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.agentMapping.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'OFFLINE' }) }),
    );
  });

  it('login continues with empty oneTimeKey when voximplant errors', async () => {
    (crmClient.verifyLogin as any).mockResolvedValue({ id: 'u-1', email: 'a@b.com', role: 'rep' });
    (prisma.agentMapping.findUnique as any).mockResolvedValue({
      id: 'am-1', crmUserId: 'u-1', voximplantUserId: 42, voximplantUsername: 'agent1',
    });
    const { voximplantAPI } = await import('../src/services/voximplant-api.js');
    (voximplantAPI.createOneTimeLoginKey as any).mockRejectedValueOnce(new Error('vox down'));
    const res = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { email: 'a@b.com', password: 'pw' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().voximplantUser.oneTimeKey).toBe('');
  });
});
