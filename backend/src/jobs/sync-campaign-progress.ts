import type { Job } from 'bullmq';
import { CampaignStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { getIO } from '../lib/io.js';

export async function processSyncCampaignProgress(_job: Job): Promise<void> {
  const active = await prisma.campaign.findMany({ where: { status: CampaignStatus.ACTIVE } });
  const io = getIO();
  for (const campaign of active) {
    const groups = await prisma.campaignContact.groupBy({
      by: ['status'],
      where: { campaignId: campaign.id },
      _count: { _all: true },
    });
    const stats: Record<string, number> = {};
    for (const g of groups) stats[g.status] = g._count._all;
    io.to('supervisors').emit('campaign:progress', { campaignId: campaign.id, stats });
  }
}
