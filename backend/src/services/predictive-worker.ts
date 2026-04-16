import { prisma } from '../lib/prisma';
import { config } from '../config';
import { logger } from '../lib/logger';
import { callListManager } from './call-list-manager';
import { io } from '../index';

/**
 * CampaignStatusMonitor replaces the old PredictiveWorker polling dialer.
 *
 * Voximplant's native Call Lists API now handles call pacing and dispatch.
 * This monitor periodically checks call list progress for active campaigns,
 * updates local contact statuses, emits WebSocket events, and auto-completes
 * campaigns when all tasks are done.
 *
 * Polls every 30 seconds instead of the old 3-second dial cycle.
 */
class CampaignStatusMonitor {
  private running = false;
  private intervalId: NodeJS.Timeout | null = null;
  private lastError: string | null = null;

  start(): void {
    if (this.running) return;
    this.running = true;
    const pollMs = 30_000; // 30 seconds
    logger.info(`Campaign status monitor starting (poll interval: ${pollMs}ms)`);

    this.intervalId = setInterval(() => {
      this.runCycle().catch((err) => {
        this.lastError = err.message;
        logger.error('Campaign status monitor error:', err);
      });
    }, pollMs);
  }

  stop(): void {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    logger.info('Campaign status monitor stopped');
  }

  async runCycle(): Promise<void> {
    const activeCampaigns = await prisma.campaign.findMany({
      where: {
        status: 'active',
        voximplantListId: { not: null },
      },
    });

    if (activeCampaigns.length === 0) return;

    for (const campaign of activeCampaigns) {
      try {
        const progress = await callListManager.getProgress(campaign.id);

        // Emit real-time progress to supervisors
        io.to('supervisors').emit('campaign:progress', {
          campaignId: campaign.id,
          ...progress,
        });
      } catch (err) {
        logger.error(`Error monitoring campaign ${campaign.id}:`, err);
      }
    }
  }

  getStatus() {
    return {
      running: this.running,
      lastError: this.lastError,
      pollIntervalMs: 30_000,
    };
  }
}

export const campaignStatusMonitor = new CampaignStatusMonitor();
