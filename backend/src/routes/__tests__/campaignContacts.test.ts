import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    campaign: {
      findUnique: vi.fn()
    },
    campaignContact: {
      findMany: vi.fn()
    }
  };
  return { prismaMock };
});

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../../middleware/auth.js', () => ({
  authenticate: async (
    req: { headers: Record<string, string>; user?: unknown },
    reply: { status: (n: number) => { send: (b: unknown) => unknown } }
  ) => {
    if (!req.headers.authorization) {
      return reply.status(401).send({ error: 'unauth' });
    }
    const role = req.headers['x-role'] || 'agent';
    (req as { user: unknown }).user = {
      id: 'u1',
      role,
      email: 'u@x.com',
      crmUserId: 'u1'
    };
  }
}));

import campaignContactRoutes from '../campaignContacts.js';

async function build(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(campaignContactRoutes, { prefix: '/api' });
  return app;
}

const contactsFixture = [
  {
    id: 'ct1',
    campaignId: 'c1',
    crmAccountId: 'acc-1',
    phone: '+15551234567',
    status: 'PENDING',
    priority: 10,
    attempts: 0,
    lastAttemptAt: null,
    lastOutcome: null,
    complianceCleared: true
  },
  {
    id: 'ct2',
    campaignId: 'c1',
    crmAccountId: 'acc-2',
    phone: '+15555550111',
    status: 'COMPLETED',
    priority: 5,
    attempts: 2,
    lastAttemptAt: new Date('2026-04-14T12:00:00Z').toISOString(),
    lastOutcome: 'answered',
    complianceCleared: true
  },
  {
    id: 'ct3',
    campaignId: 'c1',
    crmAccountId: null,
    phone: '+15555550112',
    status: 'FAILED',
    priority: 0,
    attempts: 3,
    lastAttemptAt: new Date('2026-04-15T09:30:00Z').toISOString(),
    lastOutcome: 'no-answer',
    complianceCleared: false
  }
];

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.campaign.findUnique.mockResolvedValue({ id: 'c1' });
});

describe('campaign contacts routes', () => {
  it('GET /api/campaigns/:id/contacts returns all contacts by default', async () => {
    prismaMock.campaignContact.findMany.mockResolvedValue(contactsFixture);
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/campaigns/c1/contacts',
      headers: { authorization: 'Bearer x' }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(3);
    expect(body[0].id).toBe('ct1');
    const call = prismaMock.campaignContact.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ campaignId: 'c1' });
    expect(call.take).toBe(20);
    expect(call.skip).toBe(0);
    expect(call.orderBy).toEqual([{ priority: 'desc' }, { createdAt: 'asc' }]);
  });

  it('filters by status=PENDING', async () => {
    const pending = contactsFixture.filter((c) => c.status === 'PENDING');
    prismaMock.campaignContact.findMany.mockResolvedValue(pending);
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/campaigns/c1/contacts?status=PENDING',
      headers: { authorization: 'Bearer x' }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].status).toBe('PENDING');
    const call = prismaMock.campaignContact.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ campaignId: 'c1', status: 'PENDING' });
  });

  it('returns 400 for invalid status', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/campaigns/c1/contacts?status=bogus',
      headers: { authorization: 'Bearer x' }
    });
    expect(res.statusCode).toBe(400);
    expect(prismaMock.campaignContact.findMany).not.toHaveBeenCalled();
  });

  it('honors limit and offset', async () => {
    prismaMock.campaignContact.findMany.mockResolvedValue([contactsFixture[1]]);
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/campaigns/c1/contacts?limit=1&offset=1',
      headers: { authorization: 'Bearer x' }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    const call = prismaMock.campaignContact.findMany.mock.calls[0][0];
    expect(call.take).toBe(1);
    expect(call.skip).toBe(1);
  });

  it('caps limit at 100', async () => {
    prismaMock.campaignContact.findMany.mockResolvedValue([]);
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/campaigns/c1/contacts?limit=9999',
      headers: { authorization: 'Bearer x' }
    });
    expect(res.statusCode).toBe(200);
    const call = prismaMock.campaignContact.findMany.mock.calls[0][0];
    expect(call.take).toBe(100);
  });

  it('returns 404 when the campaign does not exist', async () => {
    prismaMock.campaign.findUnique.mockResolvedValueOnce(null);
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/campaigns/missing/contacts',
      headers: { authorization: 'Bearer x' }
    });
    expect(res.statusCode).toBe(404);
    expect(prismaMock.campaignContact.findMany).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/campaigns/c1/contacts'
    });
    expect(res.statusCode).toBe(401);
  });
});
