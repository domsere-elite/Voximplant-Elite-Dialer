import {
  CampaignStatus,
  ContactStatus,
  type PrismaClient,
  type DialMode as PrismaDialMode,
} from '@prisma/client';
import type { Queue } from 'bullmq';
import type { CRMClient } from '../lib/crm-client.js';
import type { VoximplantAPI } from './voximplant-api.js';
import type { ComplianceGate } from './compliance-gate.js';
import type { DIDManager } from './did-manager.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

export class CampaignEngine {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly crm: CRMClient,
    private readonly vox: VoximplantAPI,
    private readonly gate: ComplianceGate,
    private readonly dids: DIDManager,
    private readonly queue: Queue,
  ) {}

  /** Exposed for subclasses that add per-contact compliance filtering (Task 15+). */
  protected get complianceGate(): ComplianceGate {
    return this.gate;
  }

  async populateCampaign(campaignId: string): Promise<{ inserted: number }> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error(`campaign ${campaignId} not found`);
    if (!campaign.crmCampaignId) {
      logger.warn('populateCampaign: no crmCampaignId, skipping', { campaignId });
      return { inserted: 0 };
    }
    const accounts = await this.crm.getCampaignAccounts(campaign.crmCampaignId);
    let inserted = 0;
    for (const a of accounts) {
      await this.prisma.campaignContact.upsert({
        where: { campaignId_phone: { campaignId, phone: a.phone } },
        create: {
          campaignId,
          crmAccountId: a.accountId,
          phone: a.phone,
          timezone: a.timezone ?? campaign.timezone,
          status: ContactStatus.PENDING,
          nextAttemptAfter: new Date(),
        },
        update: {
          crmAccountId: a.accountId,
          timezone: a.timezone ?? undefined,
        },
      });
      inserted += 1;
    }
    return { inserted };
  }

  async buildCallListCSV(campaignId: string): Promise<Buffer> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error(`campaign ${campaignId} not found`);

    const contacts = await this.prisma.campaignContact.findMany({
      where: { campaignId, complianceCleared: true, status: ContactStatus.PENDING },
    });

    const header =
      'phone;crm_account_id;campaign_id;caller_id;amd_enabled;vm_drop_url;__start_execution_time;__end_execution_time';

    const { startUtc, endUtc } = computeExecutionWindowUtc(
      campaign.timezone,
      campaign.dialingHoursStart,
      campaign.dialingHoursEnd,
    );

    const rows: string[] = [header];
    for (const c of contacts) {
      try {
        const callerId = await this.dids.selectCallerId(campaignId, c.phone);
        rows.push(
          [
            c.phone,
            c.crmAccountId,
            campaignId,
            callerId,
            campaign.amdEnabled ? 'true' : 'false',
            campaign.voicemailDropUrl ?? '',
            startUtc,
            endUtc,
          ].join(';'),
        );
      } catch (err) {
        logger.warn('skipping contact — callerId selection failed', {
          contactId: c.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return Buffer.from(rows.join('\n'), 'utf8');
  }

  async startCampaign(campaignId: string): Promise<void> {
    await this.populateCampaign(campaignId);
    await this.queue.add('batch-compliance-check', { campaignId });

    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error(`campaign ${campaignId} not found`);

    const csv = await this.buildCallListCSV(campaignId);
    const applicationId = Number(config.voximplant.applicationId) || 0;

    const list = await this.vox.createCallList({
      ruleId: config.voximplant.outboundPdsRuleId,
      priority: 1,
      maxSimultaneous: campaign.maxConcurrentCalls,
      numAttempts: campaign.maxAttempts,
      name: `campaign-${campaignId}`,
      fileContent: csv,
      intervalSeconds: 60,
      delimiter: ';',
    });

    const sq = await this.vox.createSmartQueue({
      name: `sq-${campaignId}`,
      applicationId,
      users: [],
    });

    const mode = campaign.dialMode === 'PREDICTIVE' ? 'predictive' : 'progressive';
    await this.vox.startPDSCampaign({
      queueId: sq.queueId,
      callListId: list.listId,
      mode,
      maxAbandonRate: campaign.maxAbandonRate,
      dialRatio: campaign.dialRatio,
    });

    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        voximplantListId: list.listId,
        voximplantQueueId: sq.queueId,
        status: CampaignStatus.ACTIVE,
      },
    });
  }

  async pauseCampaign(campaignId: string): Promise<void> {
    const c = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!c) throw new Error(`campaign ${campaignId} not found`);
    if (c.voximplantQueueId) {
      await this.vox.stopPDSCampaign(c.voximplantQueueId);
    }
    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.PAUSED },
    });
  }

  async stopCampaign(campaignId: string): Promise<void> {
    const c = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!c) throw new Error(`campaign ${campaignId} not found`);
    if (c.voximplantQueueId) {
      await this.vox.stopPDSCampaign(c.voximplantQueueId);
    }
    await this.prisma.campaignContact.updateMany({
      where: { campaignId, status: ContactStatus.PENDING },
      data: { status: ContactStatus.COMPLETED },
    });
    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.COMPLETED },
    });
  }
}

function computeExecutionWindowUtc(
  timezone: string,
  hoursStart: string,
  hoursEnd: string,
): { startUtc: string; endUtc: string } {
  const now = new Date();
  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const startUtc = localWallToUtcIso(localDate, hoursStart, timezone);
  const endUtc = localWallToUtcIso(localDate, hoursEnd, timezone);
  return { startUtc, endUtc };
}

function localWallToUtcIso(date: string, time: string, timezone: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const asUtc = Date.UTC(y, (m || 1) - 1, d, hh, mm, 0);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = fmt.formatToParts(new Date(asUtc));
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const tzUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  const offsetMs = tzUtc - asUtc;
  return new Date(asUtc - offsetMs).toISOString();
}

// Type helpers (unused constants may be useful when DI-wiring in Task 15)
export type { PrismaDialMode };
