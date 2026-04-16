import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMock, crmMock } = vi.hoisted(() => ({
  prismaMock: {
    callEvent: { findUnique: vi.fn(), update: vi.fn() },
  },
  crmMock: { logCall: vi.fn() },
}));

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../../lib/crm-client.js', () => ({ crmClient: crmMock }));
vi.mock('../../lib/logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));

import { processSyncCallOutcome, syncCallOutcomeOptions } from '../sync-call-outcome.js';
import type { Job } from 'bullmq';

beforeEach(() => vi.clearAllMocks());

describe('sync-call-outcome', () => {
  it('logs call and marks synced', async () => {
    prismaMock.callEvent.findUnique.mockResolvedValue({
      id: 'e1',
      crmAccountId: 'a1',
      durationSeconds: 45,
      dispositionCode: 'left_voicemail',
      agentMappingId: 'ag1',
      voximplantCallId: 'vc1',
      recordingUrl: null,
      status: 'completed',
    });
    crmMock.logCall.mockResolvedValue({ success: true });
    prismaMock.callEvent.update.mockResolvedValue({});

    await processSyncCallOutcome({ data: { callEventId: 'e1' } } as Job);
    expect(crmMock.logCall).toHaveBeenCalled();
    expect(prismaMock.callEvent.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { crmSynced: true },
    });
  });

  it('throws on missing event (so BullMQ retries)', async () => {
    prismaMock.callEvent.findUnique.mockResolvedValue(null);
    await expect(processSyncCallOutcome({ data: { callEventId: 'x' } } as Job)).rejects.toThrow();
  });

  it('exposes retry policy (attempts=3, exp backoff 5000)', () => {
    expect(syncCallOutcomeOptions.attempts).toBe(3);
    expect(syncCallOutcomeOptions.backoff).toEqual({ type: 'exponential', delay: 5000 });
  });
});
