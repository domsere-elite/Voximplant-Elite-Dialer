import type { Job } from 'bullmq';
import { CampaignStatus, ContactStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { complianceGate } from '../services/compliance-gate.js';

const STALE_MS = 5 * 60 * 1000;

export async function processComplianceRefresh(_job: Job): Promise<void> {
  const active = await prisma.campaign.findMany({ where: { status: CampaignStatus.ACTIVE } });
  const cutoff = new Date(Date.now() - STALE_MS);
  for (const campaign of active) {
    const stale = await prisma.campaignContact.findMany({
      where: {
        campaignId: campaign.id,
        complianceCleared: true,
        status: ContactStatus.PENDING,
        updatedAt: { lt: cutoff },
      },
      take: 500,
    });
    for (const contact of stale) {
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
      if (!result.cleared) {
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
  }
}
