import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const emitMock = vi.fn();
const toMock = vi.fn(() => ({ emit: emitMock }));

vi.mock('../src/lib/io.js', () => ({
  getIO: () => ({ to: toMock, emit: emitMock }),
  setIO: vi.fn(),
}));

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    callEvent: {
      create: vi.fn().mockResolvedValue({ id: 'ce-1' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue({
        id: 'ce-1', voximplantCallId: 'vx-1', agentMappingId: 'am-1', durationSeconds: 125,
      }),
    },
    agentMapping: {
      update: vi.fn().mockResolvedValue({ id: 'am-1', crmUserId: 'u-1' }),
      findUnique: vi.fn().mockResolvedValue({ id: 'am-1', crmUserId: 'u-1' }),
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

const addJobMock = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'job-1' }));
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({ add: addJobMock, close: vi.fn() })),
}));

// Override webhook secret used by config
process.env.VOXIMPLANT_WEBHOOK_SECRET = 'super-secret';

import { buildServer } from '../src/index.js';
import { registerWebhookRoutes } from '../src/routes/webhooks.js';
import { prisma } from '../src/lib/prisma.js';
import { resetConfig } from '../src/config.js';
import type { FastifyInstance } from 'fastify';

describe('POST /api/webhooks/voximplant', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    resetConfig();
    app = await buildServer();
    await registerWebhookRoutes(app);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    emitMock.mockClear();
    toMock.mockClear();
    addJobMock.mockClear();
  });

  const post = (payload: unknown, secret = 'super-secret') =>
    app.inject({
      method: 'POST',
      url: '/api/webhooks/voximplant',
      headers: { 'X-Webhook-Secret': secret, 'content-type': 'application/json' },
      payload: payload as never,
    });

  it('rejects missing secret with 403', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/webhooks/voximplant',
      payload: { event: 'call_started', data: {} },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects wrong secret with 403', async () => {
    const res = await post({ event: 'call_started', data: {} }, 'wrong');
    expect(res.statusCode).toBe(403);
  });

  it('call_started inserts call_event with status=initiated', async () => {
    const res = await post({
      event: 'call_started',
      data: {
        voximplantCallId: 'vx-1',
        campaignId: 'c-1',
        fromNumber: '+15551112222',
        toNumber: '+15553334444',
        direction: 'OUTBOUND',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.callEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        voximplantCallId: 'vx-1',
        status: 'initiated',
        direction: 'OUTBOUND',
      }),
    }));
  });

  it('call_answered updates status=answered', async () => {
    await post({ event: 'call_answered', data: { voximplantCallId: 'vx-1' } });
    expect(prisma.callEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { voximplantCallId: 'vx-1' },
      data: expect.objectContaining({ status: 'answered' }),
    }));
  });

  it('amd_result updates amdResult', async () => {
    await post({ event: 'amd_result', data: { voximplantCallId: 'vx-1', amdResult: 'human' } });
    expect(prisma.callEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ amdResult: 'human' }),
    }));
  });

  it('agent_connected updates call and agent mapping', async () => {
    await post({
      event: 'agent_connected',
      data: { voximplantCallId: 'vx-1', agentMappingId: 'am-1' },
    });
    expect(prisma.callEvent.updateMany).toHaveBeenCalled();
    expect(prisma.agentMapping.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'ON_CALL', currentCallId: 'vx-1' }),
    }));
  });

  it('call_ended updates, emits socket event, queues sync job', async () => {
    await post({
      event: 'call_ended',
      data: {
        voximplantCallId: 'vx-1',
        durationSeconds: 125,
        hangupReason: 'normal_clearing',
      },
    });
    expect(prisma.callEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'completed',
        durationSeconds: 125,
        hangupReason: 'normal_clearing',
      }),
    }));
    expect(prisma.agentMapping.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'WRAP_UP', currentCallId: null }),
    }));
    expect(toMock).toHaveBeenCalledWith('agent:u-1');
    expect(toMock).toHaveBeenCalledWith('supervisors');
    expect(emitMock).toHaveBeenCalledWith('call:ended', expect.any(Object));
    expect(addJobMock).toHaveBeenCalledWith('sync-call-outcome', expect.objectContaining({
      callEventId: 'ce-1',
    }), expect.any(Object));
  });

  it('recording_ready updates recordingUrl', async () => {
    await post({
      event: 'recording_ready',
      data: { voximplantCallId: 'vx-1', recordingUrl: 'https://s3/rec.mp3' },
    });
    expect(prisma.callEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ recordingUrl: 'https://s3/rec.mp3' }),
    }));
  });

  it('voicemail_dropped sets metadata.voicemail_dropped', async () => {
    await post({ event: 'voicemail_dropped', data: { voximplantCallId: 'vx-1' } });
    expect(prisma.callEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        voximplantMetadata: expect.objectContaining({ voicemail_dropped: true }),
      }),
    }));
  });

  it('rejects unknown event with 400', async () => {
    const res = await post({ event: 'unknown_thing', data: {} });
    expect(res.statusCode).toBe(400);
  });
});
