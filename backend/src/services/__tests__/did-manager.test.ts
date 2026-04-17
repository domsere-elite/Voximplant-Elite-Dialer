import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DIDManager } from '../did-manager.js';

function makePrisma() {
  return {
    campaign: {
      findUnique: vi.fn(),
    },
    phoneNumber: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
}

describe('DIDManager', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let did: DIDManager;

  beforeEach(() => {
    prisma = makePrisma();
    did = new DIDManager(prisma as never);
  });

  describe('selectCallerId - fixed', () => {
    it('returns fixed caller id when strategy=FIXED', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c1',
        callerIdStrategy: 'FIXED',
        fixedCallerId: '+15551110000',
        didGroup: { phoneNumbers: [] },
      });
      const result = await did.selectCallerId('c1', '+15551234567');
      expect(result).toBe('+15551110000');
    });

    it('throws when FIXED strategy but no fixedCallerId', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c1',
        callerIdStrategy: 'FIXED',
        fixedCallerId: null,
        didGroup: { phoneNumbers: [] },
      });
      await expect(did.selectCallerId('c1', '+15551234567')).rejects.toThrow(/fixedCallerId/);
    });
  });

  describe('selectCallerId - rotation', () => {
    it('picks least-recently-used healthy number and updates usage', async () => {
      const now = new Date('2026-04-16T10:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);

      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c1',
        callerIdStrategy: 'ROTATION',
        fixedCallerId: null,
        didGroup: {
          phoneNumbers: [
            {
              id: 'n1',
              number: '+15551110001',
              areaCode: '555',
              isActive: true,
              healthScore: 80,
              dailyCallCount: 10,
              dailyCallLimit: 100,
              cooldownUntil: null,
              lastUsedAt: new Date('2026-04-16T09:59:00Z'),
            },
            {
              id: 'n2',
              number: '+15551110002',
              areaCode: '555',
              isActive: true,
              healthScore: 80,
              dailyCallCount: 5,
              dailyCallLimit: 100,
              cooldownUntil: null,
              lastUsedAt: new Date('2026-04-16T09:00:00Z'),
            },
          ],
        },
      });
      prisma.phoneNumber.update.mockResolvedValue({});

      const result = await did.selectCallerId('c1', '+15551234567');
      expect(result).toBe('+15551110002');
      expect(prisma.phoneNumber.update).toHaveBeenCalledWith({
        where: { id: 'n2' },
        data: { lastUsedAt: now, dailyCallCount: { increment: 1 } },
      });

      vi.useRealTimers();
    });

    it('skips inactive / unhealthy / exhausted / cooling-down numbers', async () => {
      const now = new Date('2026-04-16T10:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);

      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c1',
        callerIdStrategy: 'ROTATION',
        fixedCallerId: null,
        didGroup: {
          phoneNumbers: [
            { id: 'n1', number: '+15550000001', areaCode: '555', isActive: false, healthScore: 80, dailyCallCount: 0, dailyCallLimit: 100, cooldownUntil: null, lastUsedAt: null },
            { id: 'n2', number: '+15550000002', areaCode: '555', isActive: true,  healthScore: 10, dailyCallCount: 0, dailyCallLimit: 100, cooldownUntil: null, lastUsedAt: null },
            { id: 'n3', number: '+15550000003', areaCode: '555', isActive: true,  healthScore: 80, dailyCallCount: 100, dailyCallLimit: 100, cooldownUntil: null, lastUsedAt: null },
            { id: 'n4', number: '+15550000004', areaCode: '555', isActive: true,  healthScore: 80, dailyCallCount: 0, dailyCallLimit: 100, cooldownUntil: new Date('2026-04-16T12:00:00Z'), lastUsedAt: null },
            { id: 'n5', number: '+15550000005', areaCode: '555', isActive: true,  healthScore: 80, dailyCallCount: 0, dailyCallLimit: 100, cooldownUntil: null, lastUsedAt: null },
          ],
        },
      });
      prisma.phoneNumber.update.mockResolvedValue({});

      const result = await did.selectCallerId('c1', '+15551234567');
      expect(result).toBe('+15550000005');

      vi.useRealTimers();
    });

    it('throws when no eligible numbers', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c1',
        callerIdStrategy: 'ROTATION',
        fixedCallerId: null,
        didGroup: { phoneNumbers: [] },
      });
      await expect(did.selectCallerId('c1', '+15551234567')).rejects.toThrow(/no eligible/i);
    });

    it('throws when campaign not found', async () => {
      prisma.campaign.findUnique.mockResolvedValue(null);
      await expect(did.selectCallerId('missing', '+15551234567')).rejects.toThrow(/campaign/i);
    });
  });

  describe('selectCallerId - proximity', () => {
    it('prefers matching area code', async () => {
      const now = new Date('2026-04-16T10:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);

      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c1',
        callerIdStrategy: 'PROXIMITY',
        fixedCallerId: null,
        didGroup: {
          phoneNumbers: [
            { id: 'n1', number: '+15551110001', areaCode: '555', isActive: true, healthScore: 80, dailyCallCount: 0, dailyCallLimit: 100, cooldownUntil: null, lastUsedAt: null },
            { id: 'n2', number: '+13121110002', areaCode: '312', isActive: true, healthScore: 80, dailyCallCount: 0, dailyCallLimit: 100, cooldownUntil: null, lastUsedAt: null },
          ],
        },
      });
      prisma.phoneNumber.update.mockResolvedValue({});

      // +1 (312) 555-1234 → area 312
      const result = await did.selectCallerId('c1', '+13125551234');
      expect(result).toBe('+13121110002');

      vi.useRealTimers();
    });

    it('falls back to rotation when no area match', async () => {
      const now = new Date('2026-04-16T10:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);

      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c1',
        callerIdStrategy: 'PROXIMITY',
        fixedCallerId: null,
        didGroup: {
          phoneNumbers: [
            { id: 'n1', number: '+15551110001', areaCode: '555', isActive: true, healthScore: 80, dailyCallCount: 0, dailyCallLimit: 100, cooldownUntil: null, lastUsedAt: null },
          ],
        },
      });
      prisma.phoneNumber.update.mockResolvedValue({});

      const result = await did.selectCallerId('c1', '+13125551234');
      expect(result).toBe('+15551110001');

      vi.useRealTimers();
    });
  });

  describe('updateHealth', () => {
    it('decays by 10 when answer rate < 15%', async () => {
      prisma.phoneNumber.findUnique.mockResolvedValue({ id: 'n1', healthScore: 70 });
      prisma.phoneNumber.update.mockResolvedValue({});
      await did.updateHealth('n1', 0.10);
      expect(prisma.phoneNumber.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'n1' },
          data: expect.objectContaining({ healthScore: 60 }),
        }),
      );
    });

    it('decays by 5 when answer rate between 15% and 30%', async () => {
      prisma.phoneNumber.findUnique.mockResolvedValue({ id: 'n1', healthScore: 70 });
      prisma.phoneNumber.update.mockResolvedValue({});
      await did.updateHealth('n1', 0.20);
      expect(prisma.phoneNumber.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ healthScore: 65 }) }),
      );
    });

    it('recovers by 2 when answer rate > 30%', async () => {
      prisma.phoneNumber.findUnique.mockResolvedValue({ id: 'n1', healthScore: 70 });
      prisma.phoneNumber.update.mockResolvedValue({});
      await did.updateHealth('n1', 0.40);
      expect(prisma.phoneNumber.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ healthScore: 72 }) }),
      );
    });

    it('clamps upper bound to 100', async () => {
      prisma.phoneNumber.findUnique.mockResolvedValue({ id: 'n1', healthScore: 99 });
      prisma.phoneNumber.update.mockResolvedValue({});
      await did.updateHealth('n1', 0.90);
      expect(prisma.phoneNumber.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ healthScore: 100 }) }),
      );
    });

    it('auto-deactivates when score drops below 20', async () => {
      prisma.phoneNumber.findUnique.mockResolvedValue({ id: 'n1', healthScore: 22 });
      prisma.phoneNumber.update.mockResolvedValue({});
      await did.updateHealth('n1', 0.05);
      const call = prisma.phoneNumber.update.mock.calls[0][0];
      expect(call.data.healthScore).toBe(12);
      expect(call.data.isActive).toBe(false);
      expect(call.data.cooldownUntil).toBeInstanceOf(Date);
    });

    it('no-op when phone number not found', async () => {
      prisma.phoneNumber.findUnique.mockResolvedValue(null);
      await did.updateHealth('missing', 0.10);
      expect(prisma.phoneNumber.update).not.toHaveBeenCalled();
    });
  });

  describe('resetDailyCounts', () => {
    it('zeroes dailyCallCount for all numbers', async () => {
      prisma.phoneNumber.updateMany.mockResolvedValue({ count: 42 });
      const result = await did.resetDailyCounts();
      expect(result).toBe(42);
      expect(prisma.phoneNumber.updateMany).toHaveBeenCalledWith({
        where: {},
        data: { dailyCallCount: 0 },
      });
    });
  });
});
