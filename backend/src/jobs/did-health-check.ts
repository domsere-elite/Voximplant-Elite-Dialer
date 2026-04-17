import type { Job } from 'bullmq';
import { prisma } from '../lib/prisma.js';
import { didManager } from '../services/did-manager.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function processDidHealthCheck(_job: Job): Promise<void> {
  const numbers = await prisma.phoneNumber.findMany({
    select: { id: true, number: true },
  });
  const since = new Date(Date.now() - DAY_MS);

  for (const n of numbers) {
    const total = await prisma.callEvent.count({
      where: { fromNumber: n.number, createdAt: { gte: since } },
    });
    if (total === 0) continue;
    const answered = await prisma.callEvent.count({
      where: {
        fromNumber: n.number,
        createdAt: { gte: since },
        status: 'completed',
        durationSeconds: { gt: 0 },
      },
    });
    const rate = answered / total;
    await didManager.updateHealth(n.id, rate);
  }
}
