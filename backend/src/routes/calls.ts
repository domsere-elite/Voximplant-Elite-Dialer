import { Router, Response } from 'express';
import { z } from 'zod';
import axios from 'axios';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { voximplantClient } from '../services/voximplant-client';
import { complianceService } from '../services/compliance';
import { selectCallerId } from '../services/caller-id-selector';
import { config } from '../config';
import { logger } from '../lib/logger';
import { io } from '../index';

export const callRouter = Router();
callRouter.use(authenticate);

const initiateCallSchema = z.object({
  phone: z.string().min(10),
  campaignId: z.string().optional(),
  contactId: z.string().optional(),
  mode: z.enum(['agent', 'ai']).default('agent'),
  aiPromptOverride: z.string().optional(),
});

const dispositionSchema = z.object({
  code: z.string(),
  notes: z.string().optional(),
  scheduleCallback: z.boolean().optional(),
  callbackAt: z.string().datetime().optional(),
});

// Initiate outbound call
callRouter.post('/initiate', async (req: AuthRequest, res: Response) => {
  try {
    const data = initiateCallSchema.parse(req.body);

    // Compliance checks
    const dncCheck = await complianceService.checkDNC(data.phone);
    if (dncCheck.blocked) {
      res.status(403).json({ error: 'Number is on the Do Not Call list', details: dncCheck });
      return;
    }

    const tcpaCheck = complianceService.checkTCPAWindow(data.phone);
    if (!tcpaCheck.allowed) {
      res.status(403).json({ error: 'Outside TCPA calling window', details: tcpaCheck });
      return;
    }

    // Reg F check (7 calls per debt per 7 days)
    if (data.contactId) {
      const regfCheck = await complianceService.checkRegF(data.contactId);
      if (!regfCheck.allowed) {
        res.status(403).json({ error: 'Reg F frequency limit reached', details: regfCheck });
        return;
      }
    }

    // Select caller ID based on campaign strategy
    let fromNumber = config.voximplant.defaultCallerId;
    if (data.campaignId) {
      const campaign = await prisma.campaign.findUnique({ where: { id: data.campaignId } });
      if (campaign) {
        fromNumber = await selectCallerId(
          campaign.id,
          campaign.callerIdStrategy as 'fixed' | 'rotation' | 'proximity',
          data.phone,
          campaign.fixedCallerId || undefined
        );
      }
    }

    // Create call record
    const call = await prisma.call.create({
      data: {
        direction: 'outbound',
        status: 'initiated',
        fromNumber,
        toNumber: data.phone,
        agentId: data.mode === 'agent' ? req.user!.id : null,
        campaignId: data.campaignId || null,
        contactId: data.contactId || null,
        callMode: data.mode,
      },
    });

    // Create audit event
    await prisma.callEvent.create({
      data: {
        callId: call.id,
        event: 'call_initiated',
        details: { mode: data.mode, initiatedBy: req.user!.id },
      },
    });

    // Initiate via Voximplant
    const scenarioName = data.mode === 'ai' ? 'outbound_ai' : 'outbound_agent';
    const result = await voximplantClient.startScenario({
      ruleId: scenarioName,
      scriptCustomData: JSON.stringify({
        callId: call.id,
        phone: data.phone,
        mode: data.mode,
        agentId: req.user!.id,
        campaignId: data.campaignId,
        contactId: data.contactId,
        aiPrompt: data.aiPromptOverride,
        fromNumber,
      }),
    });

    // Update call with provider reference
    await prisma.call.update({
      where: { id: call.id },
      data: {
        providerCallId: result?.mediaSessionAccessUrl || null,
        status: 'ringing',
      },
    });

    // Track Reg F attempt
    if (data.contactId) {
      await complianceService.recordRegFAttempt(data.contactId, call.id);
    }

    // Update agent status
    if (data.mode === 'agent') {
      await prisma.user.update({
        where: { id: req.user!.id },
        data: { status: 'on_call' },
      });
    }

    // Real-time notification
    io.to('supervisors').emit('call:initiated', {
      callId: call.id,
      phone: data.phone,
      mode: data.mode,
      agentId: req.user!.id,
    });

    res.status(201).json({ call });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    logger.error('Failed to initiate call:', err);
    throw err;
  }
});

// Get call history
callRouter.get('/', async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

  // Agents see only their calls, supervisors see all
  const where: any = {};
  if (req.user!.role === 'agent') {
    where.agentId = req.user!.id;
  }
  if (req.query.direction) where.direction = req.query.direction;
  if (req.query.status) where.status = req.query.status;
  if (req.query.campaignId) where.campaignId = req.query.campaignId;

  const [calls, total] = await Promise.all([
    prisma.call.findMany({
      where,
      include: {
        agent: { select: { id: true, firstName: true, lastName: true } },
        contact: { select: { id: true, firstName: true, lastName: true, phone: true, accountNumber: true } },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.call.count({ where }),
  ]);

  res.json({ calls, total, page, limit });
});

// Hangup call
callRouter.post('/:id/hangup', async (req: AuthRequest, res: Response) => {
  const call = await prisma.call.findUnique({ where: { id: req.params.id } });
  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }

  // End the call via Voximplant if it has a provider reference
  if (call.providerCallId) {
    try {
      await voximplantClient.hangupCall(call.providerCallId);
    } catch (err) {
      logger.warn('Failed to hangup via Voximplant, call may already be ended:', err);
    }
  }

  const updated = await prisma.call.update({
    where: { id: call.id },
    data: {
      status: 'completed',
      endedAt: new Date(),
      duration: call.answeredAt
        ? Math.floor((Date.now() - call.answeredAt.getTime()) / 1000)
        : 0,
    },
  });

  await prisma.callEvent.create({
    data: {
      callId: call.id,
      event: 'call_ended',
      details: { endedBy: req.user!.id },
    },
  });

  // Reset agent status
  if (call.agentId) {
    await prisma.user.update({
      where: { id: call.agentId },
      data: { status: 'wrap_up' },
    });
  }

  io.to('supervisors').emit('call:ended', { callId: call.id });

  res.json({ call: updated });
});

// Disposition a call
callRouter.post('/:id/disposition', async (req: AuthRequest, res: Response) => {
  try {
    const data = dispositionSchema.parse(req.body);

    const call = await prisma.call.findUnique({ where: { id: req.params.id } });
    if (!call) {
      res.status(404).json({ error: 'Call not found' });
      return;
    }

    await prisma.call.update({
      where: { id: call.id },
      data: { dispositionCode: data.code, notes: data.notes },
    });

    // Update campaign contact if linked
    if (call.contactId) {
      const contactUpdate: any = {};
      if (['completed', 'payment_made', 'payment_promised'].includes(data.code)) {
        contactUpdate.status = 'completed';
      } else if (data.code === 'no_answer' || data.code === 'voicemail') {
        contactUpdate.status = 'pending';
        contactUpdate.nextAttemptAfter = new Date(Date.now() + 3600 * 1000);
      } else if (data.code === 'wrong_number' || data.code === 'disconnected') {
        contactUpdate.status = 'failed';
      }

      if (Object.keys(contactUpdate).length > 0) {
        await prisma.campaignContact.update({
          where: { id: call.contactId },
          data: contactUpdate,
        });
      }

      // Schedule callback if requested
      if (data.scheduleCallback && data.callbackAt) {
        await prisma.callback.create({
          data: {
            callId: call.id,
            contactId: call.contactId,
            agentId: req.user!.id,
            scheduledAt: new Date(data.callbackAt),
            phone: call.toNumber,
          },
        });
      }
    }

    await prisma.callEvent.create({
      data: {
        callId: call.id,
        event: 'call_dispositioned',
        details: { code: data.code, notes: data.notes },
      },
    });

    // Reset agent to available
    if (call.agentId) {
      await prisma.user.update({
        where: { id: call.agentId },
        data: { status: 'available' },
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

// Get single call with audit trail
callRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  const call = await prisma.call.findUnique({
    where: { id: req.params.id },
    include: {
      agent: { select: { id: true, firstName: true, lastName: true } },
      contact: true,
      events: { orderBy: { createdAt: 'asc' } },
      recordings: true,
      transcripts: true,
    },
  });

  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  res.json({ call });
});

// =============================================================================
// Supervisor Monitoring
// =============================================================================

const superviseSchema = z.object({
  mode: z.enum(['listen', 'whisper', 'barge']),
});

// Join an active call as supervisor
callRouter.post('/:id/supervise', requireRole('supervisor', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const data = superviseSchema.parse(req.body);
    const call = await prisma.call.findUnique({ where: { id: req.params.id } });

    if (!call) {
      res.status(404).json({ error: 'Call not found' });
      return;
    }
    if (call.status !== 'in_progress') {
      res.status(400).json({ error: 'Call is not in progress' });
      return;
    }
    if (!call.providerCallId) {
      res.status(400).json({ error: 'Call has no active session URL' });
      return;
    }

    // POST to the VoxEngine session to trigger supervisor join
    await axios.post(call.providerCallId, JSON.stringify({
      action: 'supervisor_join',
      supervisorId: req.user!.id,
      mode: data.mode,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

    await prisma.callEvent.create({
      data: {
        callId: call.id,
        event: 'supervisor_joined',
        details: { supervisorId: req.user!.id, mode: data.mode },
      },
    });

    io.to(`agent:${call.agentId}`).emit('call:supervisor_joined', {
      callId: call.id,
      mode: data.mode,
    });

    res.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    logger.error('Failed to start supervision:', err);
    res.status(500).json({ error: 'Failed to join call' });
  }
});

// Leave supervisor monitoring
callRouter.post('/:id/supervise/leave', requireRole('supervisor', 'admin'), async (req: AuthRequest, res: Response) => {
  const call = await prisma.call.findUnique({ where: { id: req.params.id } });

  if (!call || !call.providerCallId) {
    res.status(404).json({ error: 'Call not found or no active session' });
    return;
  }

  try {
    await axios.post(call.providerCallId, JSON.stringify({
      action: 'supervisor_leave',
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

    await prisma.callEvent.create({
      data: {
        callId: call.id,
        event: 'supervisor_left',
        details: { supervisorId: req.user!.id },
      },
    });

    io.to(`agent:${call.agentId}`).emit('call:supervisor_left', { callId: call.id });

    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to leave supervision:', err);
    res.status(500).json({ error: 'Failed to leave call' });
  }
});

// List active calls (for supervisor dashboard)
callRouter.get('/active/list', requireRole('supervisor', 'admin'), async (_req: AuthRequest, res: Response) => {
  const activeCalls = await prisma.call.findMany({
    where: { status: { in: ['in_progress', 'ringing'] } },
    include: {
      agent: { select: { id: true, firstName: true, lastName: true } },
      contact: { select: { id: true, firstName: true, lastName: true, phone: true } },
      campaign: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ calls: activeCalls });
});
