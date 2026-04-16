import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { logger } from '../lib/logger';
import { complianceService } from '../services/compliance';
import { io } from '../index';

export const voximplantWebhookRouter = Router();

// Verify webhook requests using a shared secret.
// VoxEngine scenarios must send this as X-Webhook-Secret header.
function verifyWebhookSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = config.webhookSecret;
  if (!secret) {
    // No secret configured — reject in production, warn in dev
    if (config.env === 'production') {
      logger.error('VOXIMPLANT_WEBHOOK_SECRET not configured — rejecting webhook');
      res.status(500).json({ error: 'Webhook secret not configured' });
      return;
    }
    logger.warn('VOXIMPLANT_WEBHOOK_SECRET not configured — allowing in dev mode');
    next();
    return;
  }

  const provided = req.headers['x-webhook-secret'] as string | undefined;
  if (!provided || !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) {
    logger.warn('Webhook request with invalid or missing secret');
    res.status(401).json({ error: 'Invalid webhook secret' });
    return;
  }

  next();
}

voximplantWebhookRouter.use(verifyWebhookSecret);

// VoxEngine scenarios call back to these endpoints to report call state changes.
// This replaces the Telnyx/SignalWire webhook model from EliteDial with a
// Voximplant-native approach: scenarios use Net.httpRequestAsync() to POST events.

// Call state update from VoxEngine scenario
voximplantWebhookRouter.post('/call-event', async (req: Request, res: Response) => {
  const { callId, event, data } = req.body;

  logger.info(`VoxEngine callback: ${event} for call ${callId}`, data);

  if (!callId || !event) {
    res.status(400).json({ error: 'Missing callId or event' });
    return;
  }

  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call) {
    logger.warn(`Webhook for unknown call: ${callId}`);
    res.status(404).json({ error: 'Call not found' });
    return;
  }

  await prisma.callEvent.create({
    data: { callId, event, details: data || {} },
  });

  switch (event) {
    case 'call.session_started': {
      // Store the mediaSessionAccessUrl so supervisor can POST to the active session
      if (data?.mediaSessionAccessUrl) {
        await prisma.call.update({
          where: { id: callId },
          data: { providerCallId: data.mediaSessionAccessUrl },
        });
      }
      break;
    }

    case 'call.answered': {
      await prisma.call.update({
        where: { id: callId },
        data: {
          status: 'in_progress',
          answeredAt: new Date(),
          fromNumber: data?.fromNumber || call.fromNumber,
        },
      });
      io.to(`agent:${call.agentId}`).emit('call:answered', { callId });
      io.to('supervisors').emit('call:answered', { callId });
      break;
    }

    case 'call.amd_result': {
      await prisma.call.update({
        where: { id: callId },
        data: { amdResult: data?.result },
      });

      if (data?.result === 'machine') {
        // If machine detected, the VoxEngine scenario handles the hangup/voicemail.
        // We just record the event.
        io.to('supervisors').emit('call:amd', { callId, result: 'machine' });
      }
      break;
    }

    case 'call.ended': {
      const duration = call.answeredAt
        ? Math.floor((Date.now() - call.answeredAt.getTime()) / 1000)
        : 0;

      await prisma.call.update({
        where: { id: callId },
        data: {
          status: 'completed',
          endedAt: new Date(),
          duration,
          hangupReason: data?.reason,
        },
      });

      // Reset agent status
      if (call.agentId) {
        await prisma.user.update({
          where: { id: call.agentId },
          data: { status: 'wrap_up' },
        });
      }

      io.to(`agent:${call.agentId}`).emit('call:ended', { callId, duration });
      io.to('supervisors').emit('call:ended', { callId, duration });
      break;
    }

    case 'call.recording_ready': {
      await prisma.callRecording.create({
        data: {
          callId,
          url: data?.url,
          duration: data?.duration || 0,
          format: data?.format || 'mp3',
        },
      });
      break;
    }

    case 'call.transcript_ready': {
      await prisma.callTranscript.create({
        data: {
          callId,
          content: data?.transcript || '',
          provider: 'voximplant',
        },
      });
      break;
    }

    case 'call.ai_summary': {
      // AI agent completed — store conversation summary and outcome
      await prisma.call.update({
        where: { id: callId },
        data: {
          aiSummary: data?.summary,
          aiOutcome: data?.outcome,
          aiSentiment: data?.sentiment,
        },
      });

      if (data?.paymentPromised) {
        await prisma.paymentArrangement.create({
          data: {
            callId,
            contactId: call.contactId!,
            amount: data.paymentAmount,
            promisedDate: new Date(data.paymentDate),
            status: 'promised',
          },
        });
      }

      io.to('supervisors').emit('call:ai_summary', { callId, summary: data?.summary });
      break;
    }

    case 'call.transfer_to_agent': {
      // AI scenario is handing off to a human agent
      await prisma.call.update({
        where: { id: callId },
        data: { callMode: 'agent', transferReason: data?.reason },
      });
      io.to('supervisors').emit('call:transfer_requested', { callId, reason: data?.reason });
      break;
    }

    default:
      logger.debug(`Unhandled webhook event: ${event}`);
  }

  res.json({ ok: true });
});

// Inbound call notification from VoxEngine
voximplantWebhookRouter.post('/inbound', async (req: Request, res: Response) => {
  const { fromNumber, toNumber, callId: providerCallId } = req.body;

  logger.info(`Inbound call from ${fromNumber} to ${toNumber}`);

  const call = await prisma.call.create({
    data: {
      direction: 'inbound',
      status: 'ringing',
      fromNumber: fromNumber || '',
      toNumber: toNumber || '',
      providerCallId,
      callMode: 'agent',
    },
  });

  await prisma.callEvent.create({
    data: { callId: call.id, event: 'inbound_call', details: { fromNumber, toNumber } },
  });

  io.to('supervisors').emit('call:inbound', { callId: call.id, fromNumber });

  res.json({ callId: call.id });
});

// Real-time TCPA compliance check called by VoxEngine scenarios before dialing.
// TCPA windows shift intraday so this must be checked at dial time, not at import.
voximplantWebhookRouter.post('/compliance-check', async (req: Request, res: Response) => {
  const { phone, contactId, timezone } = req.body;

  if (!phone) {
    res.status(400).json({ allowed: false, reason: 'Missing phone number' });
    return;
  }

  const tcpaResult = complianceService.checkTCPAWindow(phone, timezone);

  logger.info(`TCPA check for ${phone}: ${tcpaResult.allowed ? 'allowed' : 'blocked'}`);

  res.json({
    allowed: tcpaResult.allowed,
    reason: tcpaResult.reason || null,
    details: tcpaResult.details,
  });
});
