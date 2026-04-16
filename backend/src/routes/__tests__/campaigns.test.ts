import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const {
  prismaMock,
  voximplantApiMock,
  campaignQueueMock,
} = vi.hoisted(() => {
  const prismaMock = {
    campaign: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    campaignContact: {
      groupBy: vi.fn(),
      updateMany: vi.fn(),
    },
    dIDGroup: {
      findUnique: vi.fn(),
    },
  };
  const voximplantApiMock = { stopPDSCampaign: vi.fn() };
  const campaignQueueMock = { add: vi.fn() };
  return { prismaMock, voximplantApiMock, campaignQueueMock };
});

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../../services/voximplant-api.js', () => ({
  VoximplantAPI: vi.fn(() => voximplantApiMock),
  voximplantAPI: voximplantApiMock,
}));
vi.mock('../../middleware/auth.js', () => ({
  authenticate: async (req: { headers: Record<string, string>; user?: unknown }, reply: { status: (n: number) => { send: (b: unknown) => unknown } }) => {
    if (!req.headers.authorization) {
      return reply.status(401).send({ error: 'unauth' });
    }
    const role = req.headers['x-role'] || 'agent';
    (req as { user: unknown }).user = { id: 'u1', role, email: 'u@x.com', crmUserId: 'u1' };
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
vi.mock('../../jobs/queue.js', () => ({
  campaignQueue: campaignQueueMock,
  syncQueue: { add: vi.fn() },
  createQueue: vi.fn(() => campaignQueueMock),
}));

import campaignRoutes from '../campaigns.js';

async function build(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(campaignRoutes, { prefix: '/api' });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('campaigns routes', () => {
  it('GET /api/campaigns lists with stats', async () => {
    prismaMock.campaign.findMany.mockResolvedValue([
      { id: 'c1', name: 'A', status: 'ACTIVE', dialMode: 'PREDICTIVE' },
    ]);
    prismaMock.campaignContact.groupBy.mockResolvedValue([
      { campaignId: 'c1', status: 'PENDING', _count: { _all: 10 } },
      { campaignId: 'c1', status: 'COMPLETED', _count: { _all: 5 } },
    ]);
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/campaigns',
      headers: { authorization: 'Bearer x' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body[0].id).toBe('c1');
    expect(body[0].stats.PENDING).toBe(10);
    expect(body[0].stats.COMPLETED).toBe(5);
  });

  it('POST /api/campaigns requires supervisor role', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { authorization: 'Bearer x', 'x-role': 'agent' },
      payload: { name: 'X', dialMode: 'MANUAL' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /api/campaigns validates body', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { authorization: 'Bearer x', 'x-role': 'supervisor' },
      payload: { name: '', dialMode: 'BOGUS' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/campaigns creates campaign with defaulted autoAnswer', async () => {
    prismaMock.dIDGroup.findUnique.mockResolvedValue({ id: '00000000-0000-0000-0000-000000000001' });
    prismaMock.campaign.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'c-new',
      ...data,
    }));
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { authorization: 'Bearer x', 'x-role': 'supervisor' },
      payload: {
        name: 'New',
        dialMode: 'PREDICTIVE',
        dialingHoursStart: '08:00',
        dialingHoursEnd: '21:00',
        timezone: 'America/Chicago',
        maxConcurrentCalls: 10,
        maxAbandonRate: 0.03,
        dialRatio: 1.2,
        maxAttempts: 3,
        retryDelayMinutes: 60,
        didGroupId: '00000000-0000-0000-0000-000000000001',
        callerIdStrategy: 'ROTATION',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.autoAnswer).toBe(true);
  });

  it('POST /api/campaigns rejects FIXED strategy without fixedCallerId', async () => {
    prismaMock.dIDGroup.findUnique.mockResolvedValue({ id: '00000000-0000-0000-0000-000000000001' });
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { authorization: 'Bearer x', 'x-role': 'supervisor' },
      payload: {
        name: 'New',
        dialMode: 'MANUAL',
        dialingHoursStart: '08:00',
        dialingHoursEnd: '21:00',
        timezone: 'America/Chicago',
        maxConcurrentCalls: 10,
        maxAbandonRate: 0.03,
        dialRatio: 1.2,
        maxAttempts: 3,
        retryDelayMinutes: 60,
        didGroupId: '00000000-0000-0000-0000-000000000001',
        callerIdStrategy: 'FIXED',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/campaigns/:id returns breakdown', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({ id: 'c1', name: 'A' });
    prismaMock.campaignContact.groupBy.mockResolvedValue([
      { status: 'PENDING', _count: { _all: 3 } },
      { status: 'COMPLIANCE_BLOCKED', _count: { _all: 1 } },
    ]);
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/campaigns/c1',
      headers: { authorization: 'Bearer x' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.breakdown.PENDING).toBe(3);
    expect(body.breakdown.COMPLIANCE_BLOCKED).toBe(1);
  });

  it('PATCH /api/campaigns/:id returns 409 when active', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({ id: 'c1', status: 'ACTIVE' });
    const app = await build();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/campaigns/c1',
      headers: { authorization: 'Bearer x', 'x-role': 'supervisor' },
      payload: { name: 'Renamed' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('POST /api/campaigns/:id/start queues job', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({ id: 'c1', status: 'DRAFT' });
    prismaMock.campaign.update.mockResolvedValue({ id: 'c1', status: 'ACTIVE' });
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns/c1/start',
      headers: { authorization: 'Bearer x', 'x-role': 'supervisor' },
    });
    expect(res.statusCode).toBe(200);
    expect(campaignQueueMock.add).toHaveBeenCalledWith('campaign-start', { campaignId: 'c1' });
  });

  it('POST /api/campaigns/:id/pause stops PDS', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({ id: 'c1', status: 'ACTIVE', voximplantQueueId: 42 });
    prismaMock.campaign.update.mockResolvedValue({ id: 'c1', status: 'PAUSED' });
    voximplantApiMock.stopPDSCampaign.mockResolvedValue(undefined);
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns/c1/pause',
      headers: { authorization: 'Bearer x', 'x-role': 'supervisor' },
    });
    expect(res.statusCode).toBe(200);
    expect(voximplantApiMock.stopPDSCampaign).toHaveBeenCalledWith(42);
  });

  it('POST /api/campaigns/:id/stop marks remaining PENDING as COMPLETED', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({ id: 'c1', status: 'ACTIVE', voximplantQueueId: 42 });
    prismaMock.campaign.update.mockResolvedValue({ id: 'c1', status: 'COMPLETED' });
    prismaMock.campaignContact.updateMany.mockResolvedValue({ count: 7 });
    voximplantApiMock.stopPDSCampaign.mockResolvedValue(undefined);
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns/c1/stop',
      headers: { authorization: 'Bearer x', 'x-role': 'supervisor' },
    });
    expect(res.statusCode).toBe(200);
    expect(prismaMock.campaignContact.updateMany).toHaveBeenCalledWith({
      where: { campaignId: 'c1', status: 'PENDING' },
      data: { status: 'COMPLETED' },
    });
  });

  it('GET /api/campaigns without auth returns 401', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/api/campaigns' });
    expect(res.statusCode).toBe(401);
  });
});
