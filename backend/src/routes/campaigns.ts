import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { normalizePhone } from '../utils/phone';
import { callListManager } from '../services/call-list-manager';
import { logger } from '../lib/logger';

export const campaignRouter = Router();
campaignRouter.use(authenticate);

const updateCampaignSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  dialMode: z.enum(['manual', 'preview', 'progressive', 'predictive', 'ai']).optional(),
  timezone: z.string().optional(),
  maxConcurrentCalls: z.number().int().min(1).max(100).optional(),
  dialRatio: z.number().min(1).max(5).optional(),
  maxAttemptsPerLead: z.number().int().min(1).max(20).optional(),
  retryDelaySeconds: z.number().int().min(60).optional(),
  aiAgentPrompt: z.string().optional(),
  aiVoice: z.string().optional(),
  aiTransferEnabled: z.boolean().optional(),
  callerIdStrategy: z.enum(['fixed', 'rotation', 'proximity']).optional(),
  fixedCallerId: z.string().optional(),
}).strict();

const createCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  dialMode: z.enum(['manual', 'preview', 'progressive', 'predictive', 'ai']),
  timezone: z.string().default('America/Chicago'),
  maxConcurrentCalls: z.number().int().min(1).max(100).default(10),
  dialRatio: z.number().min(1).max(5).default(1.2),
  maxAttemptsPerLead: z.number().int().min(1).max(20).default(3),
  retryDelaySeconds: z.number().int().min(60).default(3600),
  aiAgentPrompt: z.string().optional(),
  aiVoice: z.string().optional(),
  callerIdStrategy: z.enum(['fixed', 'rotation', 'proximity']).default('fixed'),
  fixedCallerId: z.string().optional(),
});

// List campaigns
campaignRouter.get('/', requireRole('supervisor', 'admin'), async (_req: AuthRequest, res: Response) => {
  const campaigns = await prisma.campaign.findMany({
    include: {
      _count: {
        select: {
          contacts: true,
          attempts: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ campaigns });
});

// Create campaign
campaignRouter.post('/', requireRole('supervisor', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const data = createCampaignSchema.parse(req.body);

    const campaign = await prisma.campaign.create({
      data: {
        ...data,
        createdById: req.user!.id,
      },
    });

    res.status(201).json({ campaign });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    throw err;
  }
});

// Get campaign by ID
campaignRouter.get('/:id', requireRole('supervisor', 'admin'), async (req: AuthRequest, res: Response) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: req.params.id },
    include: {
      lists: true,
      _count: {
        select: { contacts: true, attempts: true },
      },
    },
  });

  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }
  res.json({ campaign });
});

// Update campaign
campaignRouter.patch('/:id', requireRole('supervisor', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const data = updateCampaignSchema.parse(req.body);

    const campaign = await prisma.campaign.update({
      where: { id: req.params.id },
      data,
    });
    res.json({ campaign });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    throw err;
  }
});

// Start campaign — creates a Voximplant Call List with compliance-filtered contacts
campaignRouter.post('/:id/start', requireRole('supervisor', 'admin'), async (req: AuthRequest, res: Response) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  const contactCount = await prisma.campaignContact.count({
    where: { campaignId: campaign.id, status: 'pending' },
  });
  if (contactCount === 0) {
    res.status(400).json({ error: 'Campaign has no pending contacts' });
    return;
  }

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: 'active', startedAt: new Date() },
  });

  try {
    const result = await callListManager.startCampaignCallList(campaign.id);
    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    res.json({ campaign: updated, callList: result });
  } catch (err: any) {
    logger.error(`Failed to start call list for campaign ${campaign.id}:`, err);
    // Revert status if call list creation failed
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: 'draft' },
    });
    res.status(500).json({ error: err.message || 'Failed to create call list' });
  }
});

// Pause campaign — stops Voximplant Call List processing
campaignRouter.post('/:id/pause', requireRole('supervisor', 'admin'), async (req: AuthRequest, res: Response) => {
  const updated = await prisma.campaign.update({
    where: { id: req.params.id },
    data: { status: 'paused' },
  });

  try {
    await callListManager.pauseCampaignCallList(req.params.id as string);
  } catch (err) {
    logger.error(`Failed to pause call list for campaign ${req.params.id}:`, err);
  }

  res.json({ campaign: updated });
});

// Resume campaign — recovers a stopped Voximplant Call List
campaignRouter.post('/:id/resume', requireRole('supervisor', 'admin'), async (req: AuthRequest, res: Response) => {
  const updated = await prisma.campaign.update({
    where: { id: req.params.id },
    data: { status: 'active' },
  });

  try {
    await callListManager.resumeCampaignCallList(req.params.id as string);
  } catch (err) {
    logger.error(`Failed to resume call list for campaign ${req.params.id}:`, err);
  }

  res.json({ campaign: updated });
});

// Stop campaign — permanently stops the call list
campaignRouter.post('/:id/stop', requireRole('supervisor', 'admin'), async (req: AuthRequest, res: Response) => {
  const updated = await prisma.campaign.update({
    where: { id: req.params.id },
    data: { status: 'completed', completedAt: new Date() },
  });

  try {
    await callListManager.pauseCampaignCallList(req.params.id as string);
  } catch (err) {
    logger.error(`Failed to stop call list for campaign ${req.params.id}:`, err);
  }

  res.json({ campaign: updated });
});

// Get call list progress
campaignRouter.get('/:id/call-list-status', requireRole('supervisor', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const progress = await callListManager.getProgress(req.params.id as string);
    res.json(progress);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Import contacts into campaign
campaignRouter.post('/:id/import', requireRole('supervisor', 'admin'), async (req: AuthRequest, res: Response) => {
  const { listName, contacts } = req.body;

  if (!Array.isArray(contacts) || contacts.length === 0) {
    res.status(400).json({ error: 'contacts must be a non-empty array' });
    return;
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  const list = await prisma.campaignList.create({
    data: {
      name: listName || `Import ${new Date().toISOString()}`,
      campaignId: campaign.id,
    },
  });

  // Normalize all phones upfront and collect unique ones
  const normalizedContacts = contacts
    .map((c: any) => ({ ...c, phone: normalizePhone(c.phone) }))
    .filter((c: any) => c.phone !== null);

  const phonesToImport = [...new Set(normalizedContacts.map((c: any) => c.phone as string))];

  // Check DNC in a single query — only fetch phones that match our import set.
  // This avoids loading the entire DNC table into memory.
  const dncMatches = await prisma.dNCEntry.findMany({
    where: { phone: { in: phonesToImport } },
    select: { phone: true },
  });
  const dncNumbers = new Set(dncMatches.map((d) => d.phone));

  // Check existing contacts in this campaign in a single query (fixes N+1).
  const existingMatches = await prisma.campaignContact.findMany({
    where: { campaignId: campaign.id, phone: { in: phonesToImport } },
    select: { phone: true },
  });
  const existingPhones = new Set(existingMatches.map((c) => c.phone));

  let skippedDnc = 0;
  let skippedDuplicate = 0;
  const seenPhones = new Set<string>();
  const toCreate: Array<{
    campaignId: string;
    listId: string;
    phone: string;
    firstName: string | null;
    lastName: string | null;
    accountNumber: string | null;
    debtAmount: number | null;
    timezone: string | null;
    metadata: any;
  }> = [];

  for (const contact of normalizedContacts) {
    const phone = contact.phone as string;

    if (dncNumbers.has(phone)) {
      skippedDnc++;
      continue;
    }

    if (existingPhones.has(phone) || seenPhones.has(phone)) {
      skippedDuplicate++;
      continue;
    }

    seenPhones.add(phone);
    toCreate.push({
      campaignId: campaign.id,
      listId: list.id,
      phone,
      firstName: contact.firstName || null,
      lastName: contact.lastName || null,
      accountNumber: contact.accountNumber || null,
      debtAmount: contact.debtAmount ? parseFloat(contact.debtAmount) : null,
      timezone: contact.timezone || null,
      metadata: contact.metadata || {},
    });
  }

  // Batch insert all contacts in a single query
  const result = await prisma.campaignContact.createMany({ data: toCreate });
  const imported = result.count;

  await prisma.campaignList.update({
    where: { id: list.id },
    data: { totalContacts: imported },
  });

  res.status(201).json({
    list: { id: list.id, name: list.name },
    imported,
    skippedDnc,
    skippedDuplicate,
    total: contacts.length,
  });
});

// Get campaign contacts (paginated)
campaignRouter.get('/:id/contacts', requireRole('supervisor', 'admin'), async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const status = req.query.status as string | undefined;

  const where: any = { campaignId: req.params.id };
  if (status) where.status = status;

  const [contacts, total] = await Promise.all([
    prisma.campaignContact.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.campaignContact.count({ where }),
  ]);

  res.json({ contacts, total, page, limit });
});

// Get next contact for dialing (agent-facing)
// Uses atomic UPDATE ... RETURNING to prevent two agents from grabbing the same contact.
campaignRouter.get('/active/next-contact', async (req: AuthRequest, res: Response) => {
  const agentId = req.user!.id;

  const activeCampaigns = await prisma.campaign.findMany({
    where: { status: 'active' },
  });

  if (activeCampaigns.length === 0) {
    res.json({ contact: null, message: 'No active campaigns' });
    return;
  }

  for (const campaign of activeCampaigns) {
    // Atomically claim one pending contact — the WHERE status='pending'
    // ensures only one agent wins even under concurrent requests.
    const reserved = await prisma.$queryRaw<Array<any>>`
      UPDATE "CampaignContact"
      SET "status" = 'reserved',
          "reservedById" = ${agentId},
          "reservedAt" = NOW(),
          "updatedAt" = NOW()
      WHERE id = (
        SELECT id FROM "CampaignContact"
        WHERE "campaignId" = ${campaign.id}
          AND "status" = 'pending'
          AND "nextAttemptAfter" <= NOW()
        ORDER BY "priority" DESC, "nextAttemptAfter" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `;

    if (reserved.length > 0) {
      res.json({ contact: reserved[0], campaign });
      return;
    }
  }

  res.json({ contact: null, message: 'No contacts available' });
});

// Dialer status
campaignRouter.get('/dialer/status', requireRole('supervisor', 'admin'), async (_req: AuthRequest, res: Response) => {
  const activeCampaigns = await prisma.campaign.findMany({
    where: { status: 'active' },
    include: {
      _count: {
        select: { contacts: true, attempts: true },
      },
    },
  });

  const availableAgents = await prisma.user.count({
    where: {
      role: { in: ['agent', 'supervisor', 'admin'] },
      status: 'available',
      isActive: true,
    },
  });

  const activeCalls = await prisma.call.count({
    where: { status: { in: ['initiated', 'ringing', 'in_progress'] } },
  });

  res.json({
    activeCampaigns,
    availableAgents,
    activeCalls,
  });
});
