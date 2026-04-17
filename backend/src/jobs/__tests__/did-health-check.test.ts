import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMock, didMock } = vi.hoisted(() => ({
  prismaMock: {
    phoneNumber: { findMany: vi.fn() },
    callEvent: { count: vi.fn() },
  },
  didMock: { updateHealth: vi.fn() },
}));

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../../services/did-manager.js', () => ({ didManager: didMock }));

import { processDidHealthCheck } from '../did-health-check.js';
import type { Job } from 'bullmq';

beforeEach(() => vi.clearAllMocks());

describe('did-health-check', () => {
  it('computes 24h answer rate per number and calls updateHealth', async () => {
    prismaMock.phoneNumber.findMany.mockResolvedValue([{ id: 'n1', number: '+15550000001' }]);
    prismaMock.callEvent.count
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(2); // answered
    didMock.updateHealth.mockResolvedValue(undefined);

    await processDidHealthCheck({ data: {} } as Job);
    expect(didMock.updateHealth).toHaveBeenCalledWith('n1', 0.2);
  });

  it('skips numbers with no calls', async () => {
    prismaMock.phoneNumber.findMany.mockResolvedValue([{ id: 'n1', number: '+15550000001' }]);
    prismaMock.callEvent.count.mockResolvedValueOnce(0);
    await processDidHealthCheck({ data: {} } as Job);
    expect(didMock.updateHealth).not.toHaveBeenCalled();
  });
});
