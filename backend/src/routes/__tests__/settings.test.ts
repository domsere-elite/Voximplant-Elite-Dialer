import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    systemSetting: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  };
  return { prismaMock };
});

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../../middleware/auth.js', () => ({
  authenticate: async (
    req: { headers: Record<string, string>; user?: unknown },
    reply: { status: (n: number) => { send: (b: unknown) => unknown } },
  ) => {
    if (!req.headers.authorization) {
      return reply.status(401).send({ error: 'unauth' });
    }
    const role = req.headers['x-role'] || 'agent';
    (req as { user: unknown }).user = {
      id: 'u1',
      role,
      email: 'u@x.com',
      crmUserId: 'u1',
    };
  },
  requireRole: (roles: string[]) => async (
    req: { user?: { role?: string } },
    reply: { status: (n: number) => { send: (b: unknown) => unknown } },
  ) => {
    if (!req.user || !roles.includes(req.user.role ?? '')) {
      return reply.status(403).send({ error: 'forbidden' });
    }
  },
}));

import settingsRoutes from '../settings.js';

async function build(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(settingsRoutes, { prefix: '/api/settings' });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('settings routes', () => {
  it('GET /api/settings as admin returns defaults merged with DB rows', async () => {
    prismaMock.systemSetting.findMany.mockResolvedValue([
      { key: 'tcpa.window_end', value: '20:00', updatedAt: new Date() },
    ]);
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { authorization: 'Bearer x', 'x-role': 'admin' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.settings['tcpa.window_start']).toBeDefined();
    expect(body.settings['tcpa.window_end']).toBe('20:00');
    expect(body.settings['amd.enabled']).toBeDefined();
    expect(body.settings['retry.max_attempts']).toBeDefined();
  });

  it('GET /api/settings as rep returns 403', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { authorization: 'Bearer x', 'x-role': 'rep' },
    });
    expect(res.statusCode).toBe(403);
    expect(prismaMock.systemSetting.findMany).not.toHaveBeenCalled();
  });

  it('GET /api/settings without auth header returns 401', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(res.statusCode).toBe(401);
  });

  it('PATCH /api/settings as admin upserts and returns updated', async () => {
    prismaMock.systemSetting.upsert.mockImplementation(
      async ({ where, create }: { where: { key: string }; create: { key: string; value: string } }) => ({
        key: where.key,
        value: create.value,
        updatedAt: new Date(),
      }),
    );
    const app = await build();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { authorization: 'Bearer x', 'x-role': 'admin' },
      payload: { 'tcpa.window_end': '20:00', 'retry.max_attempts': '5' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.updated['tcpa.window_end']).toBe('20:00');
    expect(body.updated['retry.max_attempts']).toBe('5');
    expect(prismaMock.systemSetting.upsert).toHaveBeenCalledTimes(2);
  });

  it('PATCH /api/settings as supervisor is forbidden', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { authorization: 'Bearer x', 'x-role': 'supervisor' },
      payload: { 'tcpa.window_end': '20:00' },
    });
    expect(res.statusCode).toBe(403);
    expect(prismaMock.systemSetting.upsert).not.toHaveBeenCalled();
  });

  it('PATCH /api/settings rejects non-string values (400)', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { authorization: 'Bearer x', 'x-role': 'admin' },
      payload: { 'retry.max_attempts': 5 },
    });
    expect(res.statusCode).toBe(400);
    expect(prismaMock.systemSetting.upsert).not.toHaveBeenCalled();
  });
});
