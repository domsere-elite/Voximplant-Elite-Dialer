import { prisma } from '../lib/prisma';
import { config } from '../config';
import { logger } from '../lib/logger';
import { extractAreaCode } from '../utils/phone';

type CallerIdStrategy = 'fixed' | 'rotation' | 'proximity';

/**
 * Selects a caller ID for an outbound call based on the campaign's strategy.
 *
 * Strategies:
 *  - fixed: always use campaign.fixedCallerId or the global default
 *  - rotation: round-robin through the campaign's DID group numbers,
 *    weighted by lowest dailyCallCount, filtered by health/limits/cooldown
 *  - proximity: match destination area code first, fall back to rotation
 */
export async function selectCallerId(
  campaignId: string,
  strategy: CallerIdStrategy,
  toNumber?: string,
  fixedCallerId?: string
): Promise<string> {
  if (strategy === 'fixed') {
    return fixedCallerId || config.voximplant.defaultCallerId;
  }

  const now = new Date();

  // Get all phone numbers linked to this campaign via DID groups
  const campaignNumbers = await prisma.phoneNumber.findMany({
    where: {
      isActive: true,
      didGroupLinks: {
        some: {
          group: {
            campaigns: {
              some: { campaignId },
            },
          },
        },
      },
    },
    orderBy: { dailyCallCount: 'asc' },
  });

  if (campaignNumbers.length === 0) {
    logger.warn(`No DID group numbers for campaign ${campaignId}, using default`);
    return fixedCallerId || config.voximplant.defaultCallerId;
  }

  // Filter available numbers: under daily limit, not in cooldown, reasonable health
  const available = campaignNumbers.filter(
    (n) =>
      n.dailyCallCount < n.dailyCallLimit &&
      (!n.cooldownUntil || n.cooldownUntil <= now) &&
      n.healthScore > 20
  );

  if (available.length === 0) {
    logger.warn(`All DID numbers exhausted for campaign ${campaignId}, using default`);
    return fixedCallerId || config.voximplant.defaultCallerId;
  }

  let selected = available[0]; // default: lowest dailyCallCount (rotation)

  if (strategy === 'proximity' && toNumber) {
    const targetAreaCode = extractAreaCode(toNumber);
    if (targetAreaCode) {
      const areaMatch = available.find((n) => n.areaCode === targetAreaCode);
      if (areaMatch) {
        selected = areaMatch;
      }
      // No area code match — fall through to rotation (lowest dailyCallCount)
    }
  }

  // Atomically increment the selected number's usage
  await prisma.phoneNumber.update({
    where: { id: selected.id },
    data: {
      dailyCallCount: { increment: 1 },
      lastUsedAt: now,
    },
  });

  return selected.number;
}
