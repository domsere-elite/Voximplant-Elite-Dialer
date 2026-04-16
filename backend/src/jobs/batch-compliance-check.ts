import type { Job } from 'bullmq';
import { ContactStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { complianceGate } from '../services/compliance-gate.js';

export interface BatchComplianceCheckJob {
  campaignId: string;
}

const BATCH_SIZE = 100;

export async function processBatchComplianceCheck(job: Job<BatchComplianceCheckJob>): Promise<void> {
  const { campaignId } = job.data;
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error(`campaign ${campaignId} not found`);

  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.campaignContact.findMany({
      where: { campaignId, complianceCleared: false, status: ContactStatus.PENDING },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
    });
    if (batch.length === 0) break;

    for (const contact of batch) {
      const result = await complianceGate.checkAll(
        {
          phone: contact.phone,
          crmAccountId: contact.crmAccountId,
          timezone: contact.timezone || campaign.timezone,
        },
        {
          dialingHoursStart: campaign.dialingHoursStart,
          dialingHoursEnd: campaign.dialingHoursEnd,
        },
      );

      if (result.cleared) {
        await prisma.campaignContact.update({
          where: { id: contact.id },
          data: { complianceCleared: true, complianceBlockReason: null },
        });
      } else {
        await prisma.campaignContact.update({
          where: { id: contact.id },
          data: {
            status: ContactStatus.COMPLIANCE_BLOCKED,
            complianceCleared: false,
            complianceBlockReason: result.reasons.join(','),
          },
        });
      }
    }

    cursor = batch[batch.length - 1]?.id;
    if (batch.length < BATCH_SIZE) break;
  }
}
