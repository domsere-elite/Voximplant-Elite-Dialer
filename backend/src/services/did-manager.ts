import type { PrismaClient } from '@prisma/client';
import { logger } from '../lib/logger.js';

const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const HEALTH_ALERT_THRESHOLD = 50;
const HEALTH_DEACTIVATE_THRESHOLD = 20;
const HEALTH_MIN_TO_SELECT = 20;

interface EligibleNumber {
  id: string;
  number: string;
  areaCode: string;
  isActive: boolean;
  healthScore: number;
  dailyCallCount: number;
  dailyCallLimit: number;
  cooldownUntil: Date | null;
  lastUsedAt: Date | null;
}

export class DIDManager {
  constructor(private readonly prisma: PrismaClient) {}

  async selectCallerId(campaignId: string, contactPhone: string): Promise<string> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { didGroup: { include: { phoneNumbers: true } } },
    });

    if (!campaign) {
      throw new Error(`campaign ${campaignId} not found`);
    }

    const strategy = campaign.callerIdStrategy;

    if (strategy === 'FIXED') {
      if (!campaign.fixedCallerId) {
        throw new Error('campaign strategy=FIXED requires fixedCallerId');
      }
      return campaign.fixedCallerId;
    }

    const all = ((campaign as unknown as {
      didGroup?: { phoneNumbers?: EligibleNumber[] };
    }).didGroup?.phoneNumbers ?? []) as EligibleNumber[];
    const eligible = this.filterEligible(all);

    if (strategy === 'PROXIMITY') {
      const area = extractAreaCode(contactPhone);
      const matched = eligible.filter((n) => n.areaCode === area);
      const pool = matched.length > 0 ? matched : eligible;
      return this.pickAndMark(pool);
    }

    // ROTATION
    return this.pickAndMark(eligible);
  }

  async updateHealth(phoneNumberId: string, answerRate: number): Promise<void> {
    const row = await this.prisma.phoneNumber.findUnique({
      where: { id: phoneNumberId },
      select: { id: true, healthScore: true },
    });
    if (!row) return;

    let delta: number;
    if (answerRate < 0.15) delta = -10;
    else if (answerRate < 0.30) delta = -5;
    else delta = 2;

    const next = clamp(row.healthScore + delta, 0, 100);

    const data: {
      healthScore: number;
      isActive?: boolean;
      cooldownUntil?: Date;
    } = { healthScore: next };

    if (next < HEALTH_DEACTIVATE_THRESHOLD) {
      data.isActive = false;
      data.cooldownUntil = new Date(Date.now() + COOLDOWN_MS);
      logger.warn('phone number auto-deactivated', { phoneNumberId, healthScore: next });
    } else if (next < HEALTH_ALERT_THRESHOLD) {
      logger.warn('phone number health low', { phoneNumberId, healthScore: next });
    }

    await this.prisma.phoneNumber.update({ where: { id: phoneNumberId }, data });
  }

  async resetDailyCounts(): Promise<number> {
    const res = await this.prisma.phoneNumber.updateMany({
      where: {},
      data: { dailyCallCount: 0 },
    });
    return res.count;
  }

  private filterEligible(numbers: EligibleNumber[]): EligibleNumber[] {
    const now = Date.now();
    return numbers.filter(
      (n) =>
        n.isActive &&
        n.healthScore > HEALTH_MIN_TO_SELECT &&
        n.dailyCallCount < n.dailyCallLimit &&
        (!n.cooldownUntil || n.cooldownUntil.getTime() <= now),
    );
  }

  private async pickAndMark(pool: EligibleNumber[]): Promise<string> {
    if (pool.length === 0) {
      throw new Error('no eligible phone numbers available');
    }
    const sorted = [...pool].sort((a, b) => {
      const at = a.lastUsedAt ? a.lastUsedAt.getTime() : 0;
      const bt = b.lastUsedAt ? b.lastUsedAt.getTime() : 0;
      return at - bt;
    });
    const pick = sorted[0];
    await this.prisma.phoneNumber.update({
      where: { id: pick.id },
      data: { lastUsedAt: new Date(), dailyCallCount: { increment: 1 } },
    });
    return pick.number;
  }
}

function extractAreaCode(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const national = digits.startsWith('1') && digits.length === 11 ? digits.slice(1) : digits;
  return national.slice(0, 3);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
