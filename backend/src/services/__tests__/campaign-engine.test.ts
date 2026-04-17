import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CampaignEngine } from '../campaign-engine.js';

function makePrisma() {
  return {
    campaign: { findUnique: vi.fn(), update: vi.fn() },
    campaignContact: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
  };
}

const crm = {
  getCampaignAccounts: vi.fn(),
  logCompliance: vi.fn(),
};
const vox = {
  createCallList: vi.fn(),
  createSmartQueue: vi.fn(),
  startPDSCampaign: vi.fn(),
  stopPDSCampaign: vi.fn(),
  getCallListDetails: vi.fn(),
};
const gate = { checkAll: vi.fn() };
const dids = { selectCallerId: vi.fn() };
const queue = { add: vi.fn() };

describe('CampaignEngine', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let engine: CampaignEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    engine = new CampaignEngine(
      prisma as never,
      crm as never,
      vox as never,
      gate as never,
      dids as never,
      queue as never,
    );
  });

  it('populateCampaign upserts contacts from CRM', async () => {
    prisma.campaign.findUnique.mockResolvedValue({
      id: 'c1',
      crmCampaignId: 'crm-c1',
      timezone: 'America/Chicago',
    });
    crm.getCampaignAccounts.mockResolvedValue([
      { id: 'x1', accountId: 'a1', phone: '+15551110001', timezone: 'America/Chicago' },
      { id: 'x2', accountId: 'a2', phone: '+15551110002', timezone: 'America/Chicago' },
    ]);
    prisma.campaignContact.upsert.mockResolvedValue({});

    const result = await engine.populateCampaign('c1');
    expect(result.inserted).toBe(2);
    expect(prisma.campaignContact.upsert).toHaveBeenCalledTimes(2);
  });

  it('populateCampaign returns 0 when campaign has no crmCampaignId', async () => {
    prisma.campaign.findUnique.mockResolvedValue({
      id: 'c1',
      crmCampaignId: null,
      timezone: 'America/Chicago',
    });
    const result = await engine.populateCampaign('c1');
    expect(result.inserted).toBe(0);
    expect(crm.getCampaignAccounts).not.toHaveBeenCalled();
  });

  it('buildCallListCSV generates semicolon-delimited rows with caller IDs', async () => {
    prisma.campaign.findUnique.mockResolvedValue({
      id: 'c1',
      amdEnabled: true,
      voicemailDropUrl: 'https://vm.example/mp3',
      timezone: 'America/Chicago',
      dialingHoursStart: '08:00',
      dialingHoursEnd: '21:00',
    });
    prisma.campaignContact.findMany.mockResolvedValue([
      { id: 'cc1', phone: '+15551110001', crmAccountId: 'a1' },
      { id: 'cc2', phone: '+15551110002', crmAccountId: 'a2' },
    ]);
    dids.selectCallerId.mockResolvedValueOnce('+15552220001').mockResolvedValueOnce('+15552220002');

    const buf = await engine.buildCallListCSV('c1');
    const csv = buf.toString('utf8');
    const lines = csv.trim().split('\n');
    expect(lines[0]).toContain('phone;crm_account_id;campaign_id;caller_id;amd_enabled;vm_drop_url');
    expect(lines[1]).toContain('+15551110001;a1;c1;+15552220001;true;https://vm.example/mp3');
    expect(lines[2]).toContain('+15551110002;a2;c1;+15552220002;true;https://vm.example/mp3');
  });

  it('buildCallListCSV skips contacts whose callerId lookup fails', async () => {
    prisma.campaign.findUnique.mockResolvedValue({
      id: 'c1',
      amdEnabled: true,
      voicemailDropUrl: null,
      timezone: 'America/Chicago',
      dialingHoursStart: '08:00',
      dialingHoursEnd: '21:00',
    });
    prisma.campaignContact.findMany.mockResolvedValue([
      { id: 'cc1', phone: '+15551110001', crmAccountId: 'a1' },
      { id: 'cc2', phone: '+15551110002', crmAccountId: 'a2' },
    ]);
    dids.selectCallerId
      .mockResolvedValueOnce('+15552220001')
      .mockRejectedValueOnce(new Error('no eligible'));

    const buf = await engine.buildCallListCSV('c1');
    const csv = buf.toString('utf8');
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(2); // header + 1 data row
  });

  it('startCampaign orchestrates populate → compliance job → CSV → Vox list → queue → PDS', async () => {
    prisma.campaign.findUnique.mockResolvedValue({
      id: 'c1',
      crmCampaignId: 'crm-c1',
      name: 'X',
      dialMode: 'PREDICTIVE',
      maxConcurrentCalls: 10,
      maxAbandonRate: 0.03,
      dialRatio: 1.2,
      maxAttempts: 3,
      amdEnabled: true,
      voicemailDropUrl: null,
      timezone: 'America/Chicago',
      dialingHoursStart: '08:00',
      dialingHoursEnd: '21:00',
    });
    crm.getCampaignAccounts.mockResolvedValue([]);
    queue.add.mockResolvedValue({ id: 'j1' });
    vox.createCallList.mockResolvedValue({ listId: 999 });
    vox.createSmartQueue.mockResolvedValue({ queueId: 42 });
    vox.startPDSCampaign.mockResolvedValue(undefined);
    prisma.campaignContact.findMany.mockResolvedValue([]);
    prisma.campaign.update.mockResolvedValue({});

    await engine.startCampaign('c1');

    expect(queue.add).toHaveBeenCalledWith('batch-compliance-check', { campaignId: 'c1' });
    expect(vox.createCallList).toHaveBeenCalled();
    expect(vox.createSmartQueue).toHaveBeenCalled();
    expect(vox.startPDSCampaign).toHaveBeenCalled();
    expect(prisma.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({ voximplantListId: 999, voximplantQueueId: 42 }),
      }),
    );
  });

  it('pauseCampaign stops PDS and updates status', async () => {
    prisma.campaign.findUnique.mockResolvedValue({ id: 'c1', voximplantQueueId: 42 });
    prisma.campaign.update.mockResolvedValue({});
    vox.stopPDSCampaign.mockResolvedValue(undefined);
    await engine.pauseCampaign('c1');
    expect(vox.stopPDSCampaign).toHaveBeenCalledWith(42);
    expect(prisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'PAUSED' },
    });
  });

  it('stopCampaign stops PDS, completes pending, updates status', async () => {
    prisma.campaign.findUnique.mockResolvedValue({ id: 'c1', voximplantQueueId: 42 });
    prisma.campaignContact.updateMany.mockResolvedValue({ count: 3 });
    prisma.campaign.update.mockResolvedValue({});
    vox.stopPDSCampaign.mockResolvedValue(undefined);
    await engine.stopCampaign('c1');
    expect(prisma.campaignContact.updateMany).toHaveBeenCalledWith({
      where: { campaignId: 'c1', status: 'PENDING' },
      data: { status: 'COMPLETED' },
    });
  });
});
