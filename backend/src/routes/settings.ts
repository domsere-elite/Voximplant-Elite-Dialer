import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const DEFAULTS: Record<string, string> = {
  'tcpa.window_start': process.env.TCPA_WINDOW_START || '08:00',
  'tcpa.window_end': process.env.TCPA_WINDOW_END || '21:00',
  'tcpa.default_timezone': process.env.TCPA_DEFAULT_TZ || 'America/New_York',
  'amd.enabled': process.env.AMD_ENABLED || 'true',
  'amd.vm_drop_url': process.env.AMD_VM_DROP_URL || '',
  'retry.max_attempts': process.env.RETRY_MAX_ATTEMPTS || '3',
  'retry.delay_minutes': process.env.RETRY_DELAY_MINUTES || '30',
};

const patchBody = z.record(z.string(), z.string());

const settingsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', authenticate);

  app.get('/', { preHandler: requireRole(['supervisor', 'admin']) }, async () => {
    const rows = await prisma.systemSetting.findMany();
    const map: Record<string, string> = { ...DEFAULTS };
    for (const r of rows) map[r.key] = r.value;
    return { settings: map };
  });

  app.patch('/', { preHandler: requireRole(['admin']) }, async (req, reply) => {
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation', issues: parsed.error.issues });
    }
    const updates = parsed.data;
    const results: Record<string, string> = {};
    for (const [key, value] of Object.entries(updates)) {
      const row = await prisma.systemSetting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
      results[row.key] = row.value;
    }
    return { updated: results };
  });
};

export default settingsRoutes;
