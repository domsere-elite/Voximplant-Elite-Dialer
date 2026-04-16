import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { voximplantClient } from '../services/voximplant-client';
import { extractAreaCode } from '../utils/phone';
import { logger } from '../lib/logger';

export const systemRouter = Router();
systemRouter.use(authenticate);

// DNC management
systemRouter.get('/dnc', requireRole('supervisor', 'admin'), async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

  const [entries, total] = await Promise.all([
    prisma.dNCEntry.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.dNCEntry.count(),
  ]);

  res.json({ entries, total, page, limit });
});

systemRouter.post('/dnc', requireRole('supervisor', 'admin'), async (req: AuthRequest, res: Response) => {
  const { phone, reason } = req.body;
  if (!phone) {
    res.status(400).json({ error: 'Phone number is required' });
    return;
  }

  const entry = await prisma.dNCEntry.upsert({
    where: { phone },
    update: { reason, addedById: req.user!.id },
    create: { phone, reason, addedById: req.user!.id },
  });

  res.status(201).json({ entry });
});

systemRouter.delete('/dnc/:phone', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  await prisma.dNCEntry.delete({ where: { phone: req.params.phone } });
  res.json({ success: true });
});

// Disposition codes
systemRouter.get('/dispositions', async (_req: AuthRequest, res: Response) => {
  const codes = await prisma.dispositionCode.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  res.json({ codes });
});

const createDispositionSchema = z.object({
  code: z.string().min(1).max(50).regex(/^[a-z0-9_]+$/),
  label: z.string().min(1).max(100),
  category: z.enum(['positive', 'negative', 'neutral', 'callback']).optional(),
  requiresCallback: z.boolean().default(false),
});

systemRouter.post('/dispositions', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const data = createDispositionSchema.parse(req.body);
    const disposition = await prisma.dispositionCode.create({ data });
    res.status(201).json({ disposition });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    throw err;
  }
});

// Phone number management
systemRouter.get('/phone-numbers', requireRole('supervisor', 'admin'), async (_req: AuthRequest, res: Response) => {
  const numbers = await prisma.phoneNumber.findMany({
    orderBy: { createdAt: 'desc' },
  });
  res.json({ numbers });
});

// System settings
systemRouter.get('/settings', requireRole('admin'), async (_req: AuthRequest, res: Response) => {
  const settings = await prisma.systemSetting.findMany();
  const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  res.json({ settings: settingsMap });
});

const ALLOWED_SETTINGS = [
  'dialer_mode',
  'max_concurrent_calls',
  'recording_enabled',
  'amd_enabled',
  'ai_transfer_enabled',
  'company_name',
] as const;

const updateSettingsSchema = z.record(
  z.enum(ALLOWED_SETTINGS),
  z.string().max(1000)
);

systemRouter.put('/settings', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const updates = updateSettingsSchema.parse(req.body);

    for (const [key, value] of Object.entries(updates)) {
      await prisma.systemSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }

    res.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    throw err;
  }
});

// =============================================================================
// DID Group Management
// =============================================================================

systemRouter.get('/did-groups', requireRole('admin'), async (_req: AuthRequest, res: Response) => {
  const groups = await prisma.dIDGroup.findMany({
    include: {
      numbers: { include: { number: true } },
      campaigns: { include: { campaign: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ groups });
});

systemRouter.post('/did-groups', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const { name } = req.body;
  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const group = await prisma.dIDGroup.create({ data: { name } });
  res.status(201).json({ group });
});

systemRouter.post('/did-groups/:id/numbers', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const { numberId } = req.body;
  if (!numberId) {
    res.status(400).json({ error: 'numberId is required' });
    return;
  }
  const link = await prisma.dIDGroupNumber.create({
    data: { groupId: req.params.id as string, numberId },
  });
  res.status(201).json({ link });
});

systemRouter.delete('/did-groups/:groupId/numbers/:numberId', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  await prisma.dIDGroupNumber.deleteMany({
    where: { groupId: req.params.groupId as string, numberId: req.params.numberId as string },
  });
  res.json({ success: true });
});

systemRouter.post('/did-groups/:id/campaigns/:campaignId', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const link = await prisma.campaignDIDGroup.create({
    data: { groupId: req.params.id as string, campaignId: req.params.campaignId as string },
  });
  res.status(201).json({ link });
});

systemRouter.delete('/did-groups/:id/campaigns/:campaignId', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  await prisma.campaignDIDGroup.deleteMany({
    where: { groupId: req.params.id as string, campaignId: req.params.campaignId as string },
  });
  res.json({ success: true });
});

// =============================================================================
// Phone Number Sync & Daily Reset
// =============================================================================

// Sync phone numbers from Voximplant account into local DB
systemRouter.post('/phone-numbers/sync', requireRole('admin'), async (_req: AuthRequest, res: Response) => {
  const voxNumbers = await voximplantClient.getPhoneNumbers();
  if (!Array.isArray(voxNumbers)) {
    res.status(502).json({ error: 'Failed to fetch numbers from Voximplant' });
    return;
  }

  let synced = 0;
  for (const vn of voxNumbers) {
    const number = vn.phone_number || vn.phoneNumber;
    if (!number) continue;

    await prisma.phoneNumber.upsert({
      where: { number },
      update: { voximplantId: String(vn.phone_id || vn.phoneId || ''), isActive: true },
      create: {
        number,
        areaCode: extractAreaCode(number),
        provider: 'voximplant',
        voximplantId: String(vn.phone_id || vn.phoneId || ''),
        isActive: true,
      },
    });
    synced++;
  }

  logger.info(`Phone number sync complete: ${synced} numbers`);
  res.json({ synced });
});

// Reset daily call counts (called by a daily cron in production)
systemRouter.post('/phone-numbers/reset-daily-counts', requireRole('admin'), async (_req: AuthRequest, res: Response) => {
  const result = await prisma.phoneNumber.updateMany({ data: { dailyCallCount: 0 } });
  res.json({ reset: result.count });
});
