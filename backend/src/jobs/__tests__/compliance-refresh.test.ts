import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMock, gateMock } = vi.hoisted(() => ({
  prismaMock: {
    campaign: { findMany: vi.fn() },
    campaignContact: { findMany: vi.fn(), update: vi.fn() },
  },
  gateMock: { checkAll: vi.fn() },
}));

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../../services/compliance-gate.js', () => ({ complianceGate: gateMock }));

import { processComplianceRefresh } from '../compliance-refresh.js';
import type { Job } from 'bullmq';

beforeEach(() => vi.clearAllMocks());

describe('compliance-refresh', () => {
  it('re-checks stale cleared contacts across active campaigns', async () => {
    prismaMock.campaign.findMany.mockResolvedValue([
      { id: 'c1', dialingHoursStart: '08:00', dialingHoursEnd: '21:00', timezone: 'America/Chicago' },
    ]);
    prismaMock.campaignContact.findMany.mockResolvedValue([
      { id: 'cc1', phone: '+15550000001', crmAccountId: 'a1', timezone: 'America/Chicago' },
    ]);
    gateMock.checkAll.mockResolvedValue({ cleared: false, reasons: ['dnc_list'] });
    prismaMock.campaignContact.update.mockResolvedValue({});

    await processComplianceRefresh({ data: {} } as Job);

    expect(prismaMock.campaignContact.update).toHaveBeenCalledWith({
      where: { id: 'cc1' },
      data: expect.objectContaining({ status: 'COMPLIANCE_BLOCKED' }),
    });
  });
});
