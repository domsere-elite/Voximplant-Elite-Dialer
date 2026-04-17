import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  DialMode,
  CampaignStatus,
  ContactStatus,
  CallerIdStrategy,
  type Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { voximplantAPI } from '../services/voximplant-api.js';
import { campaignQueue } from '../jobs/queue.js';
import { logger } from '../lib/logger.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const campaignBaseShape = z.object({
  name: z.string().min(1),
  crmCampaignId: z.string().optional().nullable(),
  dialMode: z.nativeEnum(DialMode),
  autoAnswer: z.boolean().optional(),
  scheduleStart: z.coerce.date().optional().nullable(),
  scheduleEnd: z.coerce.date().optional().nullable(),
  dialingHoursStart: z.string().regex(HHMM),
  dialingHoursEnd: z.string().regex(HHMM),
  timezone: z.string().min(1),
  maxConcurrentCalls: z.number().int().min(1).max(500),
  maxAbandonRate: z.number().min(0).max(1),
  dialRatio: z.number().min(1).max(5),
  maxAttempts: z.number().int().min(1).max(20),
  retryDelayMinutes: z.number().int().min(1).max(10080),
  didGroupId: z.string().uuid(),
  callerIdStrategy: z.nativeEnum(CallerIdStrategy),
  fixedCallerId: z.string().optional().nullable(),
  amdEnabled: z.boolean().optional(),
  voicemailDropUrl: z.string().url().optional().nullable(),
});

const campaignBody = campaignBaseShape.refine(
  (v) => v.callerIdStrategy !== CallerIdStrategy.FIXED || !!v.fixedCallerId,
  { message: 'fixedCallerId required when callerIdStrategy=FIXED', path: ['fixedCallerId'] },
);

const campaignPatchBody = campaignBaseShape.partial().refine(
  (v) => v.callerIdStrategy !== CallerIdStrategy.FIXED || !!v.fixedCallerId,
  { message: 'fixedCallerId required when callerIdStrategy=FIXED', path: ['fixedCallerId'] },
);

function defaultAutoAnswer(mode: DialMode): boolean {
  return mode === DialMode.PROGRESSIVE || mode === DialMode.PREDICTIVE;
}

async function statsByCampaign(campaignIds: string[]): Promise<Record<string, Record<string, number>>> {
  if (campaignIds.length === 0) return {};
  const groups = await prisma.campaignContact.groupBy({
    by: ['campaignId', 'status'],
    where: { campaignId: { in: campaignIds } },
    _count: { _all: true },
  });
  const out: Record<string, Record<string, number>> = {};
  for (const g of groups) {
    out[g.campaignId] ??= {};
    out[g.campaignId][g.status] = g._count._all;
  }
  return out;
}

const EMPTY_BREAKDOWN: Record<ContactStatus, number> = {
  [ContactStatus.PENDING]: 0,
  [ContactStatus.COMPLIANCE_BLOCKED]: 0,
  [ContactStatus.DIALING]: 0,
  [ContactStatus.CONNECTED]: 0,
  [ContactStatus.COMPLETED]: 0,
  [ContactStatus.FAILED]: 0,
  [ContactStatus.MAX_ATTEMPTS]: 0,
};

const campaignRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', authenticate);

  app.get('/campaigns', async () => {
    const campaigns = await prisma.campaign.findMany({ orderBy: { createdAt: 'desc' } });
    const statMap = await statsByCampaign(campaigns.map((c) => c.id));
    return campaigns.map((c) => ({
      ...c,
      stats: { ...EMPTY_BREAKDOWN, ...(statMap[c.id] ?? {}) },
    }));
  });

  app.post('/campaigns', { preHandler: requireRole(['supervisor', 'admin']) }, async (req, reply) => {
    const parsed = campaignBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation', issues: parsed.error.issues });
    }
    const group = await prisma.dIDGroup.findUnique({ where: { id: parsed.data.didGroupId } });
    if (!group) return reply.status(400).send({ error: 'didGroup not found' });

    const autoAnswer = parsed.data.autoAnswer ?? defaultAutoAnswer(parsed.data.dialMode);
    const userId = req.user?.id ?? '00000000-0000-0000-0000-000000000000';

    const createData: Prisma.CampaignUncheckedCreateInput = {
      name: parsed.data.name,
      crmCampaignId: parsed.data.crmCampaignId ?? undefined,
      dialMode: parsed.data.dialMode,
      autoAnswer,
      scheduleStart: parsed.data.scheduleStart ?? undefined,
      scheduleEnd: parsed.data.scheduleEnd ?? undefined,
      dialingHoursStart: parsed.data.dialingHoursStart,
      dialingHoursEnd: parsed.data.dialingHoursEnd,
      timezone: parsed.data.timezone,
      maxConcurrentCalls: parsed.data.maxConcurrentCalls,
      maxAbandonRate: parsed.data.maxAbandonRate,
      dialRatio: parsed.data.dialRatio,
      maxAttempts: parsed.data.maxAttempts,
      retryDelayMinutes: parsed.data.retryDelayMinutes,
      didGroupId: parsed.data.didGroupId,
      callerIdStrategy: parsed.data.callerIdStrategy,
      fixedCallerId: parsed.data.fixedCallerId ?? undefined,
      amdEnabled: parsed.data.amdEnabled ?? true,
      voicemailDropUrl: parsed.data.voicemailDropUrl ?? undefined,
      status: CampaignStatus.DRAFT,
      createdBy: userId,
    };

    const created = await prisma.campaign.create({ data: createData });
    return reply.status(201).send(created);
  });

  app.get<{ Params: { id: string } }>('/campaigns/:id', async (req, reply) => {
    const c = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!c) return reply.status(404).send({ error: 'not found' });
    const groups = await prisma.campaignContact.groupBy({
      by: ['status'],
      where: { campaignId: c.id },
      _count: { _all: true },
    });
    const breakdown = { ...EMPTY_BREAKDOWN };
    for (const g of groups) {
      (breakdown as Record<string, number>)[g.status] = g._count._all;
    }
    return { ...c, breakdown };
  });

  app.patch<{ Params: { id: string } }>(
    '/campaigns/:id',
    { preHandler: requireRole(['supervisor', 'admin']) },
    async (req, reply) => {
      const existing = await prisma.campaign.findUnique({ where: { id: req.params.id } });
      if (!existing) return reply.status(404).send({ error: 'not found' });
      if (existing.status !== CampaignStatus.DRAFT && existing.status !== CampaignStatus.PAUSED) {
        return reply.status(409).send({ error: `cannot edit in status ${existing.status}` });
      }
      const parsed = campaignPatchBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'validation', issues: parsed.error.issues });
      }
      const updated = await prisma.campaign.update({
        where: { id: req.params.id },
        data: parsed.data as Prisma.CampaignUpdateInput,
      });
      return updated;
    },
  );

  app.post<{ Params: { id: string } }>(
    '/campaigns/:id/start',
    { preHandler: requireRole(['supervisor', 'admin']) },
    async (req, reply) => {
      const c = await prisma.campaign.findUnique({ where: { id: req.params.id } });
      if (!c) return reply.status(404).send({ error: 'not found' });
      const startable = new Set<CampaignStatus>([
        CampaignStatus.DRAFT,
        CampaignStatus.PAUSED,
        CampaignStatus.SCHEDULED,
      ]);
      if (!startable.has(c.status)) {
        return reply.status(409).send({ error: `cannot start from ${c.status}` });
      }
      await prisma.campaign.update({ where: { id: c.id }, data: { status: CampaignStatus.ACTIVE } });
      await campaignQueue.add('campaign-start', { campaignId: c.id });
      logger.info('campaign started', { campaignId: c.id });
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/campaigns/:id/pause',
    { preHandler: requireRole(['supervisor', 'admin']) },
    async (req, reply) => {
      const c = await prisma.campaign.findUnique({ where: { id: req.params.id } });
      if (!c) return reply.status(404).send({ error: 'not found' });
      if (c.voximplantQueueId) {
        await voximplantAPI.stopPDSCampaign(c.voximplantQueueId);
      }
      await prisma.campaign.update({ where: { id: c.id }, data: { status: CampaignStatus.PAUSED } });
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/campaigns/:id/stop',
    { preHandler: requireRole(['supervisor', 'admin']) },
    async (req, reply) => {
      const c = await prisma.campaign.findUnique({ where: { id: req.params.id } });
      if (!c) return reply.status(404).send({ error: 'not found' });
      if (c.voximplantQueueId) {
        await voximplantAPI.stopPDSCampaign(c.voximplantQueueId);
      }
      await prisma.campaignContact.updateMany({
        where: { campaignId: c.id, status: ContactStatus.PENDING },
        data: { status: ContactStatus.COMPLETED },
      });
      await prisma.campaign.update({
        where: { id: c.id },
        data: { status: CampaignStatus.COMPLETED },
      });
      return { ok: true };
    },
  );
};

export default campaignRoutes;
