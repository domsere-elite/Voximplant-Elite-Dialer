import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const prismaMock = vi.hoisted(() => ({
  callEvent: {
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  agentMapping: {
    findUnique: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
  },
  agentStatusLog: {
    updateMany: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
  },
  campaign: { findUnique: vi.fn() },
}));

const crmMock = vi.hoisted(() => ({
  getAccount: vi.fn(),
  logCompliance: vi.fn(),
  logCall: vi.fn(),
}));

const voxMock = vi.hoisted(() => ({
  startScenarios: vi.fn(),
}));

const gateMock = vi.hoisted(() => ({ checkAll: vi.fn() }));
const didMock = vi.hoisted(() => ({ selectCallerId: vi.fn() }));
const syncQueueMock = vi.hoisted(() => ({ add: vi.fn() }));

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../../lib/crm-client.js', () => ({ crmClient: crmMock }));
vi.mock('../../services/voximplant-api.js', () => ({
  voximplantAPI: voxMock,
  VoximplantAPI: vi.fn(() => voxMock),
}));
vi.mock('../../services/compliance-gate.js', () => ({ complianceGate: gateMock }));
vi.mock('../../services/did-manager.js', () => ({ didManager: didMock }));
vi.mock('../../jobs/queue.js', () => ({
  syncCallOutcomeQueue: syncQueueMock,
  campaignQueue: { add: vi.fn() },
}));
vi.mock('../../middleware/auth.js', () => ({
  authenticate: async (
    req: { headers: Record<string, string>; user?: unknown },
    reply: { status: (n: number) => { send: (b: unknown) => unknown } },
  ) => {
    if (!req.headers.authorization) {
      return reply.status(401).send({ error: 'unauth' });
    }
    (req as { user: unknown }).user = {
      id: req.headers['x-user-id'] || 'u1',
      role: req.headers['x-role'] || 'agent',
      email: 'u@x.com',
      crmUserId: req.headers['x-user-id'] || 'u1',
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

import callsRoutes from '../calls.js';

async function build(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(callsRoutes, { prefix: '/api' });
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('calls routes', () => {
  it('POST /api/calls/dial returns 403 when compliance blocks', async () => {
    prismaMock.agentMapping.findFirst.mockResolvedValue({ id: 'ag1', voximplantUsername: 'agent1@x' });
    crmMock.getAccount.mockResolvedValue({
      id: 'a1', status: 'open', phone: '+15550001111', state: 'TX', zip: '78701',
    });
    gateMock.checkAll.mockResolvedValue({ cleared: false, reasons: ['dnc_list'] });
    crmMock.logCompliance.mockResolvedValue(undefined);

    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/calls/dial',
      headers: { authorization: 'Bearer x' },
      payload: { crmAccountId: 'a1', phone: '+15550001111' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().reasons).toEqual(['dnc_list']);
    expect(crmMock.logCompliance).toHaveBeenCalled();
  });

  it('POST /api/calls/dial places call when compliance cleared', async () => {
    prismaMock.agentMapping.findFirst.mockResolvedValue({
      id: 'ag1',
      voximplantUsername: 'agent1@x',
      voximplantUserId: 42,
      crmUserId: 'u1',
    });
    crmMock.getAccount.mockResolvedValue({
      id: 'a1', status: 'open', phone: '+15550001111', state: 'TX', zip: '78701',
    });
    gateMock.checkAll.mockResolvedValue({ cleared: true, reasons: [] });
    didMock.selectCallerId.mockResolvedValue('+15552220001');
    voxMock.startScenarios.mockResolvedValue({ callSessionHistoryId: 'vs-1' });
    prismaMock.callEvent.create.mockResolvedValue({ id: 'ce1', voximplantCallId: 'vs-1' });

    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/calls/dial',
      headers: { authorization: 'Bearer x' },
      payload: { crmAccountId: 'a1', phone: '+15550001111' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().callId).toBe('ce1');
    expect(res.json().voximplantSessionId).toBe('vs-1');
    expect(voxMock.startScenarios).toHaveBeenCalled();
  });

  it('POST /api/calls/:id/disposition updates event and queues sync', async () => {
    prismaMock.callEvent.findUnique.mockResolvedValue({ id: 'ce1', crmAccountId: 'a1' });
    prismaMock.callEvent.update.mockResolvedValue({ id: 'ce1' });
    syncQueueMock.add.mockResolvedValue({});

    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/calls/ce1/disposition',
      headers: { authorization: 'Bearer x' },
      payload: { dispositionCode: 'promise_to_pay', notes: 'will call back' },
    });
    expect(res.statusCode).toBe(200);
    expect(prismaMock.callEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ce1' },
        data: expect.objectContaining({ dispositionCode: 'promise_to_pay' }),
      }),
    );
    expect(syncQueueMock.add).toHaveBeenCalledWith(
      'sync-call-outcome',
      { callEventId: 'ce1' },
      expect.any(Object),
    );
  });

  it('GET /api/calls/active requires supervisor', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/calls/active',
      headers: { authorization: 'Bearer x', 'x-role': 'agent' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /api/calls/active lists in-progress events for supervisors', async () => {
    prismaMock.callEvent.findMany.mockResolvedValue([
      { id: 'ce1', status: 'ringing', agentMapping: { id: 'ag1' }, campaign: { id: 'c1' } },
    ]);
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/calls/active',
      headers: { authorization: 'Bearer x', 'x-role': 'supervisor' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()[0].id).toBe('ce1');
    expect(prismaMock.callEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { notIn: ['completed', 'failed'] } },
        include: { agentMapping: true, campaign: true },
      }),
    );
  });

  it('PATCH /api/agents/me/status closes prior log and inserts new', async () => {
    prismaMock.agentMapping.findFirst.mockResolvedValue({
      id: 'ag1',
      status: 'AVAILABLE',
      crmUserId: 'u1',
    });
    prismaMock.agentStatusLog.findFirst.mockResolvedValue({
      id: 'l1',
      agentMappingId: 'ag1',
      status: 'AVAILABLE',
      startedAt: new Date(Date.now() - 60_000),
    });
    prismaMock.agentStatusLog.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.agentStatusLog.create.mockResolvedValue({ id: 'l2' });
    prismaMock.agentMapping.update.mockResolvedValue({ id: 'ag1', status: 'BREAK' });

    const app = await build();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/agents/me/status',
      headers: { authorization: 'Bearer x' },
      payload: { status: 'BREAK' },
    });
    expect(res.statusCode).toBe(200);
    expect(prismaMock.agentStatusLog.updateMany).toHaveBeenCalled();
    expect(prismaMock.agentStatusLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ agentMappingId: 'ag1', status: 'BREAK' }),
    });
    expect(prismaMock.agentMapping.update).toHaveBeenCalledWith({
      where: { id: 'ag1' },
      data: { status: 'BREAK' },
    });
  });
});
