import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AgentStatus, CallDirection } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { crmClient } from '../lib/crm-client.js';
import { voximplantAPI } from '../services/voximplant-api.js';
import { complianceGate } from '../services/compliance-gate.js';
import { didManager } from '../services/did-manager.js';
import { syncCallOutcomeQueue } from '../jobs/queue.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { logger } from '../lib/logger.js';
import { config } from '../config.js';

const dialBody = z.object({
  crmAccountId: z.string().min(1),
  phone: z.string().min(1),
  campaignId: z.string().uuid().optional(),
});

const dispositionBody = z.object({
  dispositionCode: z.string().min(1),
  notes: z.string().optional(),
  callbackAt: z.coerce.date().optional(),
});

const statusBody = z.object({
  status: z.nativeEnum(AgentStatus),
});

const callsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', authenticate);

  app.post('/calls/dial', async (req, reply) => {
    const parsed = dialBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation', issues: parsed.error.issues });
    }
    const { crmAccountId, phone, campaignId } = parsed.data;
    const user = req.user;

    const agent = await prisma.agentMapping.findFirst({ where: { crmUserId: user.crmUserId } });
    if (!agent) {
      return reply.status(400).send({ error: 'no agent mapping for user' });
    }

    const campaign = campaignId
      ? await prisma.campaign.findUnique({ where: { id: campaignId } })
      : null;
    const dialingHoursStart = campaign?.dialingHoursStart ?? '08:00';
    const dialingHoursEnd = campaign?.dialingHoursEnd ?? '21:00';

    let timezone = campaign?.timezone ?? 'America/Chicago';
    try {
      const account = await crmClient.getAccount(crmAccountId);
      if (typeof account?.timezone === 'string') {
        timezone = account.timezone;
      }
    } catch (err) {
      logger.warn('failed to fetch CRM account — continuing with default timezone', {
        err: err instanceof Error ? err.message : String(err),
        crmAccountId,
      });
    }

    const gate = await complianceGate.checkAll(
      { phone, crmAccountId, timezone },
      { dialingHoursStart, dialingHoursEnd },
    );

    if (!gate.cleared) {
      try {
        await crmClient.logCompliance({
          phone,
          check: 'dnc',
          result: 'block',
          reason: gate.reasons.join(','),
          accountId: crmAccountId,
          campaignId: campaignId ?? undefined,
        });
      } catch (err) {
        logger.warn('failed to log compliance block', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
      return reply.status(403).send({ error: 'compliance_blocked', reasons: gate.reasons });
    }

    let callerId: string;
    try {
      callerId = await didManager.selectCallerId(campaignId ?? 'manual', phone);
    } catch (err) {
      logger.warn('callerId selection failed', {
        err: err instanceof Error ? err.message : String(err),
      });
      return reply.status(503).send({ error: 'no_caller_id_available' });
    }

    const customData = JSON.stringify({
      to: phone,
      from: callerId,
      crmAccountId,
      campaignId: campaignId ?? null,
      agentUsername: agent.voximplantUsername,
      amdEnabled: campaign?.amdEnabled ?? true,
      vmDropUrl: campaign?.voicemailDropUrl ?? null,
    });

    const session = await voximplantAPI.startScenarios({
      ruleId: config.voximplant.outboundAgentRuleId,
      userId: agent.voximplantUserId,
      customData,
    });

    const callEvent = await prisma.callEvent.create({
      data: {
        voximplantCallId: session.callSessionHistoryId,
        campaignId: campaignId ?? null,
        agentMappingId: agent.id,
        crmAccountId,
        direction: CallDirection.OUTBOUND,
        fromNumber: callerId,
        toNumber: phone,
        status: 'initiated',
      },
    });

    return { callId: callEvent.id, voximplantSessionId: callEvent.voximplantCallId };
  });

  app.post<{ Params: { id: string } }>('/calls/:id/disposition', async (req, reply) => {
    const parsed = dispositionBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation', issues: parsed.error.issues });
    }

    const event = await prisma.callEvent.findUnique({ where: { id: req.params.id } });
    if (!event) return reply.status(404).send({ error: 'not found' });

    await prisma.callEvent.update({
      where: { id: req.params.id },
      data: { dispositionCode: parsed.data.dispositionCode },
    });

    await syncCallOutcomeQueue.add(
      'sync-call-outcome',
      { callEventId: req.params.id },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    if (parsed.data.callbackAt && event.crmAccountId) {
      try {
        await crmClient.logCall(event.crmAccountId, {
          duration: event.durationSeconds ?? 0,
          outcome: 'callback_scheduled',
          agentId: event.agentMappingId ?? '',
          voximplantCallId: event.voximplantCallId,
          notes: parsed.data.notes,
        });
      } catch (err) {
        logger.warn('failed to log callback via CRM', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { ok: true };
  });

  app.get('/calls/active', { preHandler: requireRole(['supervisor', 'admin']) }, async () => {
    const events = await prisma.callEvent.findMany({
      where: { status: { notIn: ['completed', 'failed'] } },
      include: { agentMapping: true, campaign: true },
      orderBy: { createdAt: 'desc' },
    });
    return events;
  });

  app.patch('/agents/me/status', async (req, reply) => {
    const parsed = statusBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation', issues: parsed.error.issues });
    }
    const user = req.user;

    const agent = await prisma.agentMapping.findFirst({ where: { crmUserId: user.crmUserId } });
    if (!agent) return reply.status(404).send({ error: 'no agent mapping' });

    const now = new Date();
    const prev = await prisma.agentStatusLog.findFirst({
      where: { agentMappingId: agent.id, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (prev) {
      const duration = Math.max(
        0,
        Math.floor((now.getTime() - new Date(prev.startedAt).getTime()) / 1000),
      );
      await prisma.agentStatusLog.updateMany({
        where: { id: prev.id },
        data: { endedAt: now, durationSeconds: duration },
      });
    }
    await prisma.agentStatusLog.create({
      data: {
        agentMappingId: agent.id,
        status: parsed.data.status,
        startedAt: now,
        campaignId: agent.currentCampaignId ?? null,
      },
    });
    const updated = await prisma.agentMapping.update({
      where: { id: agent.id },
      data: { status: parsed.data.status },
    });
    return updated;
  });
};

export default callsRoutes;
