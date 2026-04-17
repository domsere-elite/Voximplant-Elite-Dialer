import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const rangeQuery = z
  .object({
    dateFrom: z.string().datetime().optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
    dateTo: z.string().datetime().optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  })
  .strict();

type RangeQuery = z.infer<typeof rangeQuery>;

function parseRange(q: RangeQuery): { from: Date; to: Date } {
  const to = q.dateTo ? new Date(q.dateTo) : new Date();
  const from = q.dateFrom
    ? new Date(q.dateFrom)
    : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { from, to };
}

// Treat both 'answered' and 'connected' status strings as connected for the report.
function isConnected(status: string): boolean {
  return status === 'answered' || status === 'connected';
}

const reportsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', requireRole(['supervisor', 'admin']));

  app.get('/campaigns', async (req, reply) => {
    const parsed = rangeQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation', issues: parsed.error.issues });
    }
    const { from, to } = parseRange(parsed.data);

    const campaigns = await prisma.campaign.findMany({ select: { id: true, name: true } });

    const rows = await Promise.all(
      campaigns.map(async (c) => {
        const events = await prisma.callEvent.findMany({
          where: { campaignId: c.id, createdAt: { gte: from, lte: to } },
          select: {
            status: true,
            durationSeconds: true,
            amdResult: true,
            dispositionCode: true,
          },
        });
        const total = events.length;
        const connected = events.filter((e) => isConnected(e.status)).length;
        const amd = events.filter((e) => e.amdResult === 'machine').length;
        const durSum = events.reduce(
          (s, e) => s + (e.durationSeconds || 0),
          0,
        );
        const outcomes: Record<string, number> = {};
        for (const e of events) {
          const k = e.dispositionCode || 'unknown';
          outcomes[k] = (outcomes[k] || 0) + 1;
        }
        return {
          id: c.id,
          name: c.name,
          total_dialed: total,
          total_connected: connected,
          connect_rate: total ? connected / total : 0,
          amd_rate: total ? amd / total : 0,
          avg_duration: connected ? Math.round(durSum / connected) : 0,
          outcomes,
          // WHY: CampaignMetric model isn't persisted yet (see Task 36 / metrics backlog);
          // surfacing 0 as a placeholder keeps the response shape stable for the frontend.
          abandon_rate: 0,
        };
      }),
    );

    return { campaigns: rows };
  });

  app.get('/agents', async (req, reply) => {
    const parsed = rangeQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation', issues: parsed.error.issues });
    }
    const { from, to } = parseRange(parsed.data);

    const mappings = await prisma.agentMapping.findMany({
      select: { id: true, crmEmail: true },
    });

    const rows = await Promise.all(
      mappings.map(async (a) => {
        const events = await prisma.callEvent.findMany({
          where: { agentMappingId: a.id, createdAt: { gte: from, lte: to } },
          select: {
            status: true,
            durationSeconds: true,
            dispositionCode: true,
          },
        });
        const count = events.length;
        const talk = events.reduce(
          (s, e) => s + (e.durationSeconds || 0),
          0,
        );
        const connected = events.filter((e) => isConnected(e.status)).length;
        const dispositions: Record<string, number> = {};
        for (const e of events) {
          const k = e.dispositionCode || 'none';
          dispositions[k] = (dispositions[k] || 0) + 1;
        }
        return {
          id: a.id,
          name: a.crmEmail,
          calls_handled: count,
          talk_time_seconds: talk,
          avg_handle_time: count ? Math.round(talk / count) : 0,
          connect_rate: count ? connected / count : 0,
          dispositions,
        };
      }),
    );

    return { agents: rows };
  });

  app.get('/did-health', async (req, reply) => {
    const parsed = rangeQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation', issues: parsed.error.issues });
    }
    const { from, to } = parseRange(parsed.data);

    const numbers = await prisma.phoneNumber.findMany({
      select: {
        number: true,
        areaCode: true,
        state: true,
        healthScore: true,
      },
    });

    const rows = await Promise.all(
      numbers.map(async (n) => {
        const events = await prisma.callEvent.findMany({
          where: { fromNumber: n.number, createdAt: { gte: from, lte: to } },
          select: { status: true, createdAt: true },
        });
        const total = events.length;
        const connected = events.filter((e) => isConnected(e.status)).length;
        const daily: Record<string, number> = {};
        for (const e of events) {
          const key = e.createdAt.toISOString().slice(0, 10);
          daily[key] = (daily[key] || 0) + 1;
        }
        return {
          number: n.number,
          area_code: n.areaCode,
          state: n.state,
          calls: total,
          connect_rate: total ? connected / total : 0,
          health_score: n.healthScore,
          daily_usage: daily,
        };
      }),
    );

    return { numbers: rows };
  });
};

export default reportsRoutes;
