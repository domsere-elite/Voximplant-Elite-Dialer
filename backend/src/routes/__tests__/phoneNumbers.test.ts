import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    phoneNumber: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
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

import phoneNumberRoutes from '../phoneNumbers.js';

async function build(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(phoneNumberRoutes, { prefix: '/api' });
  return app;
}

const numberFixture = {
  id: 'n1',
  number: '+15551234567',
  voximplantNumberId: 42,
  didGroupId: null,
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

describe('phone-numbers routes', () => {
  it('GET /api/phone-numbers returns all numbers', async () => {
    prismaMock.phoneNumber.findMany.mockResolvedValue([numberFixture]);
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/phone-numbers',
      headers: { authorization: 'Bearer x' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].number).toBe('+15551234567');
    expect(body[0].areaCode).toBe('555');
    expect(body[0].healthScore).toBe(100);
    const call = prismaMock.phoneNumber.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual({ number: 'asc' });
  });

  it('GET /api/phone-numbers without auth returns 401', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/api/phone-numbers' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/phone-numbers admin creates', async () => {
    prismaMock.phoneNumber.create.mockResolvedValue({ ...numberFixture, id: 'n-new' });
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/phone-numbers',
      headers: { authorization: 'Bearer x', 'x-role': 'admin' },
      payload: {
        number: '+15551234567',
        voximplantNumberId: 42,
        areaCode: '555',
        state: 'TX',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBe('n-new');
    expect(prismaMock.phoneNumber.create).toHaveBeenCalled();
    const call = prismaMock.phoneNumber.create.mock.calls[0][0];
    expect(call.data.number).toBe('+15551234567');
    expect(call.data.voximplantNumberId).toBe(42);
  });

  it('POST /api/phone-numbers non-admin is forbidden', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/phone-numbers',
      headers: { authorization: 'Bearer x', 'x-role': 'supervisor' },
      payload: {
        number: '+15551234567',
        areaCode: '555',
      },
    });
    expect(res.statusCode).toBe(403);
    expect(prismaMock.phoneNumber.create).not.toHaveBeenCalled();
  });

  it('POST /api/phone-numbers rejects invalid E.164', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/phone-numbers',
      headers: { authorization: 'Bearer x', 'x-role': 'admin' },
      payload: {
        number: '5551234',
        areaCode: '555',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/phone-numbers rejects unknown fields (strict)', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/phone-numbers',
      headers: { authorization: 'Bearer x', 'x-role': 'admin' },
      payload: {
        number: '+15551234567',
        areaCode: '555',
        bogus: 'nope',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST accepts optional voximplantNumberId omitted or null', async () => {
    prismaMock.phoneNumber.create.mockResolvedValue({ ...numberFixture, id: 'n-new', voximplantNumberId: null });
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/phone-numbers',
      headers: { authorization: 'Bearer x', 'x-role': 'admin' },
      payload: {
        number: '+15551234567',
        areaCode: '555',
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it('PATCH /api/phone-numbers/:id admin updates', async () => {
    prismaMock.phoneNumber.findUnique.mockResolvedValue(numberFixture);
    prismaMock.phoneNumber.update.mockResolvedValue({
      ...numberFixture,
      isActive: false,
      dailyCallLimit: 50,
    });
    const app = await build();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/phone-numbers/n1',
      headers: { authorization: 'Bearer x', 'x-role': 'admin' },
      payload: { isActive: false, dailyCallLimit: 50 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.isActive).toBe(false);
    expect(body.dailyCallLimit).toBe(50);
    const call = prismaMock.phoneNumber.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'n1' });
    expect(call.data.isActive).toBe(false);
    expect(call.data.dailyCallLimit).toBe(50);
  });

  it('PATCH /api/phone-numbers/:id supervisor is forbidden', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/phone-numbers/n1',
      headers: { authorization: 'Bearer x', 'x-role': 'supervisor' },
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(403);
    expect(prismaMock.phoneNumber.update).not.toHaveBeenCalled();
  });

  it('PATCH /api/phone-numbers/:id unknown id returns 404', async () => {
    prismaMock.phoneNumber.findUnique.mockResolvedValue(null);
    const app = await build();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/phone-numbers/missing',
      headers: { authorization: 'Bearer x', 'x-role': 'admin' },
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(404);
    expect(prismaMock.phoneNumber.update).not.toHaveBeenCalled();
  });

  it('PATCH /api/phone-numbers/:id rejects unsupported fields', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/phone-numbers/n1',
      headers: { authorization: 'Bearer x', 'x-role': 'admin' },
      payload: { healthScore: 0 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PATCH /api/phone-numbers/:id accepts cooldownUntil null', async () => {
    prismaMock.phoneNumber.findUnique.mockResolvedValue(numberFixture);
    prismaMock.phoneNumber.update.mockResolvedValue({ ...numberFixture, cooldownUntil: null });
    const app = await build();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/phone-numbers/n1',
      headers: { authorization: 'Bearer x', 'x-role': 'admin' },
      payload: { cooldownUntil: null },
    });
    expect(res.statusCode).toBe(200);
    const call = prismaMock.phoneNumber.update.mock.calls[0][0];
    expect(call.data.cooldownUntil).toBeNull();
  });

  it('PATCH /api/phone-numbers/:id accepts didGroupId set and unset', async () => {
    prismaMock.phoneNumber.findUnique.mockResolvedValue(numberFixture);
    prismaMock.phoneNumber.update.mockResolvedValue({
      ...numberFixture,
      didGroupId: '00000000-0000-0000-0000-000000000001',
    });
    const app = await build();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/phone-numbers/n1',
      headers: { authorization: 'Bearer x', 'x-role': 'admin' },
      payload: { didGroupId: '00000000-0000-0000-0000-000000000001' },
    });
    expect(res.statusCode).toBe(200);
    const call = prismaMock.phoneNumber.update.mock.calls[0][0];
    expect(call.data.didGroup).toEqual({
      connect: { id: '00000000-0000-0000-0000-000000000001' },
    });
  });

  it('PATCH /api/phone-numbers/:id disconnects didGroup when null', async () => {
    prismaMock.phoneNumber.findUnique.mockResolvedValue(numberFixture);
    prismaMock.phoneNumber.update.mockResolvedValue({ ...numberFixture, didGroupId: null });
    const app = await build();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/phone-numbers/n1',
      headers: { authorization: 'Bearer x', 'x-role': 'admin' },
      payload: { didGroupId: null },
    });
    expect(res.statusCode).toBe(200);
    const call = prismaMock.phoneNumber.update.mock.calls[0][0];
    expect(call.data.didGroup).toEqual({ disconnect: true });
  });
});
