import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMock, emitMock, toMock, getIOMock } = vi.hoisted(() => {
  const emitMock = vi.fn();
  const toMock = vi.fn(() => ({ emit: emitMock }));
  const getIOMock = vi.fn(() => ({ to: toMock }));
  return {
    prismaMock: {
      campaign: { findMany: vi.fn() },
      campaignContact: { groupBy: vi.fn() },
    },
    emitMock,
    toMock,
    getIOMock,
  };
});

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../../lib/io.js', () => ({ getIO: getIOMock }));

import { processSyncCampaignProgress } from '../sync-campaign-progress.js';
import type { Job } from 'bullmq';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sync-campaign-progress', () => {
  it('emits progress for each active campaign', async () => {
    prismaMock.campaign.findMany.mockResolvedValue([{ id: 'c1' }]);
    prismaMock.campaignContact.groupBy.mockResolvedValue([
      { status: 'PENDING', _count: { _all: 5 } },
      { status: 'COMPLETED', _count: { _all: 2 } },
    ]);
    toMock.mockReturnValue({ emit: emitMock });

    await processSyncCampaignProgress({ data: {} } as Job);

    expect(toMock).toHaveBeenCalledWith('supervisors');
    expect(emitMock).toHaveBeenCalledWith(
      'campaign:progress',
      expect.objectContaining({ campaignId: 'c1' }),
    );
  });
});
