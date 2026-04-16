import type { Job } from 'bullmq';
import { prisma } from '../lib/prisma.js';
import { crmClient } from '../lib/crm-client.js';
import { logger } from '../lib/logger.js';

export interface SyncCallOutcomeJob {
  callEventId: string;
  voximplantCallId?: string;
}

export const syncCallOutcomeOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
};

export async function processSyncCallOutcome(job: Job<SyncCallOutcomeJob>): Promise<void> {
  const { callEventId } = job.data;
  const event = await prisma.callEvent.findUnique({ where: { id: callEventId } });
  if (!event) throw new Error(`call event ${callEventId} not found`);
  if (!event.crmAccountId) {
    logger.warn('no crmAccountId; skipping CRM sync', { callEventId });
    return;
  }

  await crmClient.logCall(event.crmAccountId, {
    duration: event.durationSeconds ?? 0,
    outcome: event.dispositionCode ?? event.status ?? 'unknown',
    agentId: event.agentMappingId ?? '',
    voximplantCallId: event.voximplantCallId,
    recordingUrl: event.recordingUrl ?? undefined,
  });

  await prisma.callEvent.update({
    where: { id: callEventId },
    data: { crmSynced: true },
  });
}
