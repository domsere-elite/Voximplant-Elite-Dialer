import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ContactStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

const VALID_STATUSES = new Set<string>(Object.values(ContactStatus));

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  max: number
): number {
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, max);
}

const campaignContactRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', authenticate);

  app.get<{
    Params: { id: string };
    Querystring: { status?: string; limit?: string; offset?: string };
  }>('/campaigns/:id/contacts', async (req, reply) => {
    const { status } = req.query;
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const offset = parsePositiveInt(req.query.offset, 0, 1_000_000);

    if (status !== undefined && !VALID_STATUSES.has(status)) {
      return reply.status(400).send({ error: 'invalid status' });
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      select: { id: true }
    });
    if (!campaign) {
      return reply.status(404).send({ error: 'campaign not found' });
    }

    const where: { campaignId: string; status?: ContactStatus } = {
      campaignId: req.params.id
    };
    if (status !== undefined) {
      where.status = status as ContactStatus;
    }

    const contacts = await prisma.campaignContact.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: limit,
      skip: offset,
      select: {
        id: true,
        campaignId: true,
        crmAccountId: true,
        phone: true,
        status: true,
        priority: true,
        attempts: true,
        lastAttemptAt: true,
        lastOutcome: true,
        complianceCleared: true
      }
    });

    return contacts;
  });
};

export default campaignContactRoutes;
