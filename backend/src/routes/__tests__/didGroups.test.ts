import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    dIDGroup: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    phoneNumber: {
      findUnique: vi.fn(),
      update: vi.fn(),
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

import didGroupRoutes from '../didGroups.js';

async function build(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(didGroupRoutes, { prefix: '/api' });
  return app;
}

const phoneFixture = {
  id: 'n1',
  number: '+15551234567',
  voximplantNumberId: 42,
  didGroupId: 'g1',
  areaCode: '555',
  state: 'TX',
  isActive: true,
  healthScore: 100,
  dailyCallCount: 0,
  dailyCallLimit: 100,
  lastUsedAt: null,
  cooldownUntil: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('did-groups routes', () => {
  it('GET /api/did-groups returns id/name/numbers sorted by name', async () => {
    prismaMock.dIDGroup.findMany.mockResolvedValue([
      { id: 'g1', name: 'Alpha Group', phoneNumbers: [phoneFixture] },
      { id: 'g2', name: 'Beta Group', phoneNumbers: [] },
    ]);
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/did-groups',
      headers: { authorization: 'Bearer x' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual({
      id: 'g1',
      name: 'Alpha Group',
      numbers: [phoneFixture],
    });
    expect(body[1]).toEqual({ id: 'g2', name: 'Beta Group', numbers: [] });
    const call = prismaMock.dIDGroup.findMany.mock.calls[0][0];
    expect(call.select.id).toBe(true);
    expect(call.select.name).toBe(true);
    expect(call.select.phoneNumbers).toBeDefined();
    expect(call.orderBy).toEqual({ name: 'asc' });
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

  it('POST /api/did-groups admin creates a group', async () => {
    prismaMock.dIDGroup.create.mockResolvedValue({ id: 'g-new', name: 'Newish' });
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/did-groups',
      headers: { authorization: 'Bearer x', 'x-role': 'admin' },
      payload: { name: 'Newish' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBe('g-new');
    expect(body.name).toBe('Newish');
    expect(body.numbers).toEqual([]);
  });

  it('POST /api/did-groups supervisor is forbidden', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/did-groups',
      headers: { authorization: 'Bearer x', 'x-role': 'supervisor' },
      payload: { name: 'Nope' },
    });
    expect(res.statusCode).toBe(403);
    expect(prismaMock.dIDGroup.create).not.toHaveBeenCalled();
  });

  it('POST /api/did-groups rejects empty name', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/did-groups',
      headers: { authorization: 'Bearer x', 'x-role': 'admin' },
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/did-groups/:id/numbers assigns a number', async () => {
    prismaMock.dIDGroup.findUnique.mockResolvedValue({ id: 'g1', name: 'Alpha' });
    prismaMock.phoneNumber.findUnique.mockResolvedValue({ ...phoneFixture, didGroupId: null });
    prismaMock.phoneNumber.update.mockResolvedValue({ ...phoneFixture, didGroupId: 'g1' });
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/did-groups/g1/numbers',
      headers: { authorization: 'Bearer x', 'x-role': 'admin' },
      payload: { phoneNumberId: '00000000-0000-0000-0000-000000000101' },
    });
    expect(res.statusCode).toBe(200);
    const call = prismaMock.phoneNumber.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: '00000000-0000-0000-0000-000000000101' });
    expect(call.data.didGroupId).toBe('g1');
  });

  it('POST /api/did-groups/:id/numbers 404 on unknown group', async () => {
    prismaMock.dIDGroup.findUnique.mockResolvedValue(null);
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/did-groups/missing/numbers',
      headers: { authorization: 'Bearer x', 'x-role': 'admin' },
      payload: { phoneNumberId: '00000000-0000-0000-0000-000000000101' },
    });
    expect(res.statusCode).toBe(404);
    expect(prismaMock.phoneNumber.update).not.toHaveBeenCalled();
  });

  it('POST /api/did-groups/:id/numbers 404 on unknown number', async () => {
    prismaMock.dIDGroup.findUnique.mockResolvedValue({ id: 'g1', name: 'Alpha' });
    prismaMock.phoneNumber.findUnique.mockResolvedValue(null);
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/did-groups/g1/numbers',
      headers: { authorization: 'Bearer x', 'x-role': 'admin' },
      payload: { phoneNumberId: '00000000-0000-0000-0000-000000000999' },
    });
    expect(res.statusCode).toBe(404);
    expect(prismaMock.phoneNumber.update).not.toHaveBeenCalled();
  });

  it('POST /api/did-groups/:id/numbers supervisor is forbidden', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/did-groups/g1/numbers',
      headers: { authorization: 'Bearer x', 'x-role': 'supervisor' },
      payload: { phoneNumberId: '00000000-0000-0000-0000-000000000101' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('DELETE /api/did-groups/:id/numbers/:numberId removes', async () => {
    prismaMock.phoneNumber.findUnique.mockResolvedValue(phoneFixture);
    prismaMock.phoneNumber.update.mockResolvedValue({ ...phoneFixture, didGroupId: null });
    const app = await build();
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/did-groups/g1/numbers/n1',
      headers: { authorization: 'Bearer x', 'x-role': 'admin' },
    });
    expect(res.statusCode).toBe(200);
    const call = prismaMock.phoneNumber.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'n1' });
    expect(call.data.didGroupId).toBeNull();
  });

  it('DELETE /api/did-groups/:id/numbers/:numberId 404 when number not in group', async () => {
    prismaMock.phoneNumber.findUnique.mockResolvedValue({
      ...phoneFixture,
      didGroupId: 'other',
    });
    const app = await build();
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/did-groups/g1/numbers/n1',
      headers: { authorization: 'Bearer x', 'x-role': 'admin' },
    });
    expect(res.statusCode).toBe(404);
    expect(prismaMock.phoneNumber.update).not.toHaveBeenCalled();
  });

  it('DELETE /api/did-groups/:id/numbers/:numberId supervisor is forbidden', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/did-groups/g1/numbers/n1',
      headers: { authorization: 'Bearer x', 'x-role': 'supervisor' },
    });
    expect(res.statusCode).toBe(403);
  });
});
