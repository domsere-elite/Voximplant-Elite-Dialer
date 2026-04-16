import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    dIDGroup: {
      findMany: vi.fn(),
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
}));

import didGroupRoutes from '../didGroups.js';

async function build(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(didGroupRoutes, { prefix: '/api' });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('did-groups routes', () => {
  it('GET /api/did-groups returns id/name sorted by name', async () => {
    prismaMock.dIDGroup.findMany.mockResolvedValue([
      { id: 'g1', name: 'Alpha Group' },
      { id: 'g2', name: 'Beta Group' },
    ]);
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/did-groups',
      headers: { authorization: 'Bearer x' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual([
      { id: 'g1', name: 'Alpha Group' },
      { id: 'g2', name: 'Beta Group' },
    ]);
    expect(prismaMock.dIDGroup.findMany).toHaveBeenCalledWith({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  });

  it('GET /api/did-groups without auth returns 401', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/api/did-groups' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/did-groups returns empty list when no groups', async () => {
    prismaMock.dIDGroup.findMany.mockResolvedValue([]);
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/did-groups',
      headers: { authorization: 'Bearer x' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});
