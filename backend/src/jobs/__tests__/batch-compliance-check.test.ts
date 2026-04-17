import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMock, gateMock } = vi.hoisted(() => ({
  prismaMock: {
    campaign: { findUnique: vi.fn() },
    campaignContact: { findMany: vi.fn(), update: vi.fn() },
  },
  gateMock: { checkAll: vi.fn() },
}));

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../../services/compliance-gate.js', () => ({ complianceGate: gateMock }));

import { processBatchComplianceCheck } from '../batch-compliance-check.js';
import type { Job } from 'bullmq';

beforeEach(() => vi.resetAllMocks());

describe('batch-compliance-check', () => {
  it('processes contacts in batches of 100 and updates status', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({
      id: 'c1',
      dialingHoursStart: '08:00',
      dialingHoursEnd: '21:00',
      timezone: 'America/Chicago',
    });
    const batch1 = Array.from({ length: 100 }, (_, i) => ({
      id: `cc${i}`,
      phone: `+1555000${i.toString().padStart(4, '0')}`,
      crmAccountId: `a${i}`,
      timezone: 'America/Chicago',
    }));
    const batch2 = Array.from({ length: 3 }, (_, i) => ({
      id: `cx${i}`,
      phone: `+1555900${i}`,
      crmAccountId: `b${i}`,
      timezone: 'America/Chicago',
    }));
    prismaMock.campaignContact.findMany
      .mockResolvedValueOnce(batch1)
      .mockResolvedValueOnce(batch2)
      .mockResolvedValueOnce([]);
    gateMock.checkAll.mockResolvedValue({ cleared: true, reasons: [] });
    prismaMock.campaignContact.update.mockResolvedValue({});

    await processBatchComplianceCheck({ data: { campaignId: 'c1' } } as Job);
    expect(prismaMock.campaignContact.update).toHaveBeenCalledTimes(103);
  });

  it('marks blocked contacts with reasons', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({
      id: 'c1',
      dialingHoursStart: '08:00',
      dialingHoursEnd: '21:00',
      timezone: 'America/Chicago',
    });
    prismaMock.campaignContact.findMany
      .mockResolvedValueOnce([{ id: 'cc1', phone: '+15550000001', crmAccountId: 'a1', timezone: 'America/Chicago' }])
      .mockResolvedValueOnce([]);
    gateMock.checkAll.mockResolvedValue({ cleared: false, reasons: ['dnc_list'] });
    prismaMock.campaignContact.update.mockResolvedValue({});

    await processBatchComplianceCheck({ data: { campaignId: 'c1' } } as Job);
    expect(prismaMock.campaignContact.update).toHaveBeenCalledWith({
      where: { id: 'cc1' },
      data: {
        status: 'COMPLIANCE_BLOCKED',
        complianceCleared: false,
        complianceBlockReason: 'dnc_list',
      },
    });
  });
});
