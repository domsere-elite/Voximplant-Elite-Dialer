import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Queue } from 'bullmq';
import { z } from 'zod';
import { AgentStatus, CallDirection } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { getIO } from '../lib/io.js';
import { logger } from '../lib/logger.js';
import { config } from '../config.js';

const syncQueue = new Queue('sync-call-outcome', {
  connection: { url: config.redis.url } as never,
});

const EventEnum = z.enum([
  'call_started',
  'call_answered',
  'amd_result',
  'call_ended',
  'recording_ready',
  'agent_connected',
  'voicemail_dropped',
]);

const BodySchema = z.object({
  event: EventEnum,
  data: z.record(z.string(), z.any()),
});

type WebhookBody = z.infer<typeof BodySchema>;

function toCallDirection(raw: unknown): CallDirection {
  const v = String(raw ?? '').toUpperCase();
  return v === 'INBOUND' ? CallDirection.INBOUND : CallDirection.OUTBOUND;
}

export async function registerWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/webhooks/voximplant', async (req: FastifyRequest, reply: FastifyReply) => {
    const secret = req.headers['x-webhook-secret'];
    if (!secret || secret !== config.webhook.secret) {
      return reply.status(403).send({ error: 'forbidden' });
    }

    const parsedBody = BodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: 'invalid_body', issues: parsedBody.error.issues });
    }

    const { event, data } = parsedBody.data as WebhookBody;
    const callId = data.voximplantCallId as string | undefined;

    if (!callId) {
      return reply.status(400).send({ error: 'missing_voximplantCallId' });
    }

    try {
      switch (event) {
        case 'call_started':
          await prisma.callEvent.create({
            data: {
              voximplantCallId: callId,
              campaignId: (data.campaignId as string) ?? null,
              contactId: (data.contactId as string) ?? null,
              crmAccountId: (data.crmAccountId as string) ?? null,
              direction: toCallDirection(data.direction),
              fromNumber: (data.fromNumber as string) ?? '',
              toNumber: (data.toNumber as string) ?? '',
              status: 'initiated',
              voximplantMetadata: (data.metadata ?? {}) as never,
            },
          });
          break;

        case 'call_answered':
          await prisma.callEvent.updateMany({
            where: { voximplantCallId: callId },
            data: { status: 'answered' },
          });
          break;

        case 'amd_result':
          await prisma.callEvent.updateMany({
            where: { voximplantCallId: callId },
            data: { amdResult: data.amdResult as string },
          });
          break;

        case 'agent_connected':
          await prisma.callEvent.updateMany({
            where: { voximplantCallId: callId },
            data: { agentMappingId: data.agentMappingId as string },
          });
          await prisma.agentMapping.update({
            where: { id: data.agentMappingId as string },
            data: { status: AgentStatus.ON_CALL, currentCallId: callId },
          });
          break;

        case 'call_ended': {
          await prisma.callEvent.updateMany({
            where: { voximplantCallId: callId },
            data: {
              status: 'completed',
              durationSeconds: (data.durationSeconds as number) ?? 0,
              hangupReason: (data.hangupReason as string) ?? null,
            },
          });

          const existing = await prisma.callEvent.findFirst({
            where: { voximplantCallId: callId },
          });

          if (existing?.agentMappingId) {
            const agent = await prisma.agentMapping.update({
              where: { id: existing.agentMappingId },
              data: { status: AgentStatus.WRAP_UP, currentCallId: null },
            });
            try {
              const io = getIO();
              io.to(`agent:${agent.crmUserId}`).emit('call:ended', {
                callId,
                durationSeconds: existing.durationSeconds,
              });
              io.to('supervisors').emit('call:ended', {
                callId,
                agentId: agent.crmUserId,
                durationSeconds: existing.durationSeconds,
              });
            } catch (err) {
              logger.warn('socket emit failed', {
                err: err instanceof Error ? err.message : String(err),
              });
            }
          }

          await syncQueue.add(
            'sync-call-outcome',
            { callEventId: existing?.id, voximplantCallId: callId },
            { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
          );
          break;
        }

        case 'recording_ready':
          await prisma.callEvent.updateMany({
            where: { voximplantCallId: callId },
            data: { recordingUrl: data.recordingUrl as string },
          });
          break;

        case 'voicemail_dropped':
          await prisma.callEvent.updateMany({
            where: { voximplantCallId: callId },
            data: {
              voximplantMetadata: { voicemail_dropped: true },
            },
          });
          break;

        default:
          return reply.status(400).send({ error: 'unknown_event' });
      }
    } catch (err) {
      logger.error('webhook handler error', {
        err: err instanceof Error ? err.message : String(err),
        event,
        callId,
      });
      return reply.status(500).send({ error: 'handler_failed' });
    }

    return reply.status(200).send({ ok: true });
  });
}
