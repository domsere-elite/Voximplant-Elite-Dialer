import { prisma } from '../lib/prisma';
import { config } from '../config';
import { logger } from '../lib/logger';
import { voximplantClient } from './voximplant-client';
import { complianceService } from './compliance';
import { selectCallerId } from './caller-id-selector';

/**
 * CallListManager bridges local campaigns with Voximplant's native Call Lists API.
 *
 * Voximplant handles pacing, retry scheduling, and call dispatching.
 * We handle compliance gating:
 *   - DNC + Reg F: pre-filtered at list creation time (stable checks)
 *   - TCPA: checked in real-time by VoxEngine scenario via webhook (windows shift intraday)
 */
class CallListManager {
  /**
   * Create a Voximplant Call List from a campaign's pending contacts.
   * Pre-filters DNC and Reg F, builds CSV, and dispatches to Voximplant.
   */
  async startCampaignCallList(campaignId: string): Promise<{
    listId: number;
    dispatched: number;
    skippedDnc: number;
    skippedRegf: number;
  }> {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

    const contacts = await prisma.campaignContact.findMany({
      where: { campaignId, status: 'pending' },
      orderBy: [{ priority: 'desc' }, { nextAttemptAfter: 'asc' }],
    });

    if (contacts.length === 0) throw new Error('No pending contacts');

    let skippedDnc = 0;
    let skippedRegf = 0;
    const passingContacts: Array<typeof contacts[0] & { fromNumber: string; localCallId: string }> = [];

    // Pre-filter: DNC + Reg F (stable checks that don't change intraday)
    for (const contact of contacts) {
      const dncCheck = await complianceService.checkDNC(contact.phone);
      if (!dncCheck.allowed) {
        skippedDnc++;
        await prisma.campaignContact.update({
          where: { id: contact.id },
          data: { status: 'skipped' },
        });
        continue;
      }

      const regfCheck = await complianceService.checkRegF(contact.id);
      if (!regfCheck.allowed) {
        skippedRegf++;
        await prisma.campaignContact.update({
          where: { id: contact.id },
          data: { status: 'skipped' },
        });
        continue;
      }

      // Select caller ID for this contact
      const fromNumber = await selectCallerId(
        campaign.id,
        campaign.callerIdStrategy as 'fixed' | 'rotation' | 'proximity',
        contact.phone,
        campaign.fixedCallerId || undefined
      );

      // Pre-create local call record so VoxEngine can reference it
      const call = await prisma.call.create({
        data: {
          direction: 'outbound',
          status: 'initiated',
          callMode: campaign.dialMode === 'ai' ? 'ai' : 'agent',
          fromNumber,
          toNumber: contact.phone,
          campaignId: campaign.id,
          contactId: contact.id,
        },
      });

      // Track Reg F attempt
      await complianceService.recordRegFAttempt(contact.id, call.id);

      passingContacts.push({
        ...contact,
        fromNumber,
        localCallId: call.id,
      });
    }

    if (passingContacts.length === 0) {
      throw new Error('All contacts blocked by compliance checks');
    }

    // Build CSV for Voximplant Call List
    // Voximplant requires 'phone_number' column; additional columns become custom data
    const csvHeader = 'phone_number;call_id;contact_id;campaign_id;contact_name;debt_amount;account_number;timezone;from_number;dial_mode;ai_prompt;ai_voice';
    const csvRows = passingContacts.map((c) => {
      const name = [c.firstName, c.lastName].filter(Boolean).join(' ');
      return [
        c.phone,
        c.localCallId,
        c.id,
        campaign.id,
        name,
        c.debtAmount || '',
        c.accountNumber || '',
        c.timezone || campaign.timezone,
        c.fromNumber,
        campaign.dialMode,
        (campaign.aiAgentPrompt || '').replace(/;/g, ','), // escape semicolons
        campaign.aiVoice || '',
      ].join(';');
    });
    const csvContent = [csvHeader, ...csvRows].join('\n');

    // Determine which rule to use based on dial mode
    const ruleId = campaign.dialMode === 'ai'
      ? config.voximplant.applicationId // Will need to map to actual rule IDs
      : config.voximplant.applicationId;

    const result = await voximplantClient.createCallList({
      ruleId,
      name: `${campaign.name} - ${new Date().toISOString().slice(0, 16)}`,
      maxSimultaneous: campaign.maxConcurrentCalls,
      numAttempts: campaign.maxAttemptsPerLead,
      csvContent,
      intervalSeconds: campaign.retryDelaySeconds,
    });

    if (!result) throw new Error('Failed to create Voximplant call list');

    // Store list ID on campaign
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        voximplantListId: result.listId,
        voximplantListStatus: 'processing',
      },
    });

    // Mark contacts as dialing
    await prisma.campaignContact.updateMany({
      where: {
        id: { in: passingContacts.map((c) => c.id) },
      },
      data: { status: 'dialing', lastAttemptAt: new Date() },
    });

    logger.info(
      `Campaign ${campaignId}: dispatched ${passingContacts.length} contacts to call list ${result.listId}`
    );

    return {
      listId: result.listId,
      dispatched: passingContacts.length,
      skippedDnc,
      skippedRegf,
    };
  }

  /**
   * Pause a campaign's call list.
   */
  async pauseCampaignCallList(campaignId: string): Promise<void> {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign?.voximplantListId) {
      logger.warn(`Campaign ${campaignId} has no Voximplant call list to pause`);
      return;
    }

    await voximplantClient.stopCallListProcessing(campaign.voximplantListId);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { voximplantListStatus: 'stopped' },
    });
  }

  /**
   * Resume a paused campaign's call list.
   */
  async resumeCampaignCallList(campaignId: string): Promise<void> {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign?.voximplantListId) {
      logger.warn(`Campaign ${campaignId} has no Voximplant call list to resume`);
      return;
    }

    await voximplantClient.recoverCallList(campaign.voximplantListId);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { voximplantListStatus: 'processing' },
    });
  }

  /**
   * Get progress of a campaign's call list from Voximplant.
   */
  async getProgress(campaignId: string): Promise<{
    total: number;
    completed: number;
    inProgress: number;
    canceled: number;
    error: number;
    pending: number;
  }> {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign?.voximplantListId) {
      return { total: 0, completed: 0, inProgress: 0, canceled: 0, error: 0, pending: 0 };
    }

    const details = await voximplantClient.getCallListDetails(campaign.voximplantListId);
    const tasks = details?.result || [];

    const stats = { total: tasks.length, completed: 0, inProgress: 0, canceled: 0, error: 0, pending: 0 };
    for (const task of tasks) {
      const status = (task.status || '').toLowerCase();
      if (status === 'completed' || status === 'processed') stats.completed++;
      else if (status === 'in progress' || status === 'processing') stats.inProgress++;
      else if (status === 'canceled' || status === 'cancelled') stats.canceled++;
      else if (status === 'error') stats.error++;
      else stats.pending++;
    }

    // Auto-complete campaign if all tasks are done
    if (stats.total > 0 && stats.inProgress === 0 && stats.pending === 0) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { voximplantListStatus: 'completed', status: 'completed', completedAt: new Date() },
      });
    }

    return stats;
  }
}

export const callListManager = new CallListManager();
