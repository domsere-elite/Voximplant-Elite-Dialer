import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    campaign: {
      findMany: vi.fn(),
    },
    callEvent: {
      findMany: vi.fn(),
    },
    agentMapping: {
      findMany: vi.fn(),
    },
    phoneNumber: {
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
  requireRole: (roles: string[]) => async (
    req: { user?: { role?: string } },
    reply: { status: (n: number) => { send: (b: unknown) => unknown } },
  ) => {
    if (!req.user || !roles.includes(req.user.role ?? '')) {
      return reply.status(403).send({ error: 'forbidden' });
    }
  },
}));

import reportsRoutes from '../reports.js';

async function build(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(reportsRoutes, { prefix: '/api/reports' });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.campaign.findMany.mockResolvedValue([]);
  prismaMock.callEvent.findMany.mockResolvedValue([]);
  prismaMock.agentMapping.findMany.mockResolvedValue([]);
  prismaMock.phoneNumber.findMany.mockResolvedValue([]);
});

describe('reports routes', () => {
  it('GET /api/reports/campaigns supervisor returns empty campaigns array', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/reports/campaigns',
      headers: { authorization: 'Bearer x', 'x-role': 'supervisor' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ campaigns: [] });
  });

  it('GET /api/reports/agents supervisor returns empty agents array', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/reports/agents',
      headers: { authorization: 'Bearer x', 'x-role': 'supervisor' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ agents: [] });
  });

  it('GET /api/reports/did-health supervisor returns empty numbers array', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/reports/did-health',
      headers: { authorization: 'Bearer x', 'x-role': 'supervisor' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ numbers: [] });
  });

  it('rejects agent role with 403', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/reports/campaigns',
      headers: { authorization: 'Bearer x' /* default role = agent */ },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects request without authorization with 401', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/reports/campaigns',
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/reports/campaigns computes connect_rate, amd_rate, avg_duration', async () => {
    prismaMock.campaign.findMany.mockResolvedValue([{ id: 'c1', name: 'Camp 1' }]);
    prismaMock.callEvent.findMany.mockResolvedValue([
      { status: 'answered', durationSeconds: 60, amdResult: null, dispositionCode: 'sold' },
      { status: 'connected', durationSeconds: 120, amdResult: null, dispositionCode: 'sold' },
      { status: 'no_answer', durationSeconds: 0, amdResult: null, dispositionCode: null },
      { status: 'busy', durationSeconds: 0, amdResult: 'machine', dispositionCode: null },
    ]);
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/reports/campaigns?dateFrom=2026-01-01&dateTo=2026-04-16',
      headers: { authorization: 'Bearer x', 'x-role': 'supervisor' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.campaigns).toHaveLength(1);
    const c = body.campaigns[0];
    expect(c.id).toBe('c1');
    expect(c.name).toBe('Camp 1');
    expect(c.total_dialed).toBe(4);
    expect(c.total_connected).toBe(2);
    expect(c.connect_rate).toBe(0.5);
    expect(c.amd_rate).toBe(0.25);
    expect(c.avg_duration).toBe(90); // (60+120)/2
    expect(c.abandon_rate).toBe(0);
    expect(c.outcomes).toEqual({ sold: 2, unknown: 2 });
  });

  it('GET /api/reports/agents computes talk time, AHT, connect_rate, uses crmEmail as name', async () => {
    prismaMock.agentMapping.findMany.mockResolvedValue([
      { id: 'a1', crmEmail: 'alice@example.com' },
    ]);
    prismaMock.callEvent.findMany.mockResolvedValue([
      { status: 'answered', durationSeconds: 100, dispositionCode: 'sold' },
      { status: 'no_answer', durationSeconds: 0, dispositionCode: null },
    ]);
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/reports/agents',
      headers: { authorization: 'Bearer x', 'x-role': 'supervisor' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.agents).toHaveLength(1);
    const a = body.agents[0];
    expect(a.name).toBe('alice@example.com');
    expect(a.calls_handled).toBe(2);
    expect(a.talk_time_seconds).toBe(100);
    expect(a.avg_handle_time).toBe(50);
    expect(a.connect_rate).toBe(0.5);
    expect(a.dispositions).toEqual({ sold: 1, none: 1 });
  });

  it('GET /api/reports/did-health filters CallEvent by fromNumber and returns camelCase-sourced fields', async () => {
    prismaMock.phoneNumber.findMany.mockResolvedValue([
      { number: '+15551234567', areaCode: '555', state: 'TX', healthScore: 90 },
    ]);
    prismaMock.callEvent.findMany.mockResolvedValue([
      { status: 'answered', createdAt: new Date('2026-04-10T00:00:00Z') },
      { status: 'no_answer', createdAt: new Date('2026-04-10T12:00:00Z') },
    ]);
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/reports/did-health',
      headers: { authorization: 'Bearer x', 'x-role': 'supervisor' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.numbers).toHaveLength(1);
    const n = body.numbers[0];
    expect(n.number).toBe('+15551234567');
    expect(n.area_code).toBe('555');
    expect(n.state).toBe('TX');
    expect(n.calls).toBe(2);
    expect(n.connect_rate).toBe(0.5);
    expect(n.health_score).toBe(90);
    expect(n.daily_usage).toEqual({ '2026-04-10': 2 });

    const callEventFindArgs = prismaMock.callEvent.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(callEventFindArgs.where.fromNumber).toBe('+15551234567');
  });
});
