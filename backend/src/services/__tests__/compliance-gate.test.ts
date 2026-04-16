import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComplianceGate } from '../compliance-gate.js';

function makeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string, _mode?: string, _ttl?: number) => {
      store.set(k, v);
      return 'OK';
    }),
  };
}

function makeCrm() {
  return {
    checkDNC: vi.fn(),
    getAccount: vi.fn(),
    getTCPACompliance: vi.fn(),
    logCall: vi.fn(),
    updateStatus: vi.fn(),
    logCompliance: vi.fn(),
    getCampaignAccounts: vi.fn(),
    searchAccounts: vi.fn(),
    verifyLogin: vi.fn(),
  };
}

describe('ComplianceGate', () => {
  let crm: ReturnType<typeof makeCrm>;
  let redis: ReturnType<typeof makeRedis>;
  let gate: ComplianceGate;

  beforeEach(() => {
    crm = makeCrm();
    redis = makeRedis();
    gate = new ComplianceGate(crm as never, redis as never);
  });

  describe('checkDNC', () => {
    it('returns cached result when present', async () => {
      redis.store.set('dnc:+15551234567', JSON.stringify({ blocked: true, reason: 'dnc_list' }));
      const result = await gate.checkDNC('+15551234567');
      expect(result).toEqual({ blocked: true, reason: 'dnc_list' });
      expect(crm.checkDNC).not.toHaveBeenCalled();
    });

    it('calls CRM + caches result on miss (blocked)', async () => {
      crm.checkDNC.mockResolvedValue({ blocked: true, reason: 'consumer_request' });
      const result = await gate.checkDNC('+15551234567');
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('consumer_request');
      expect(crm.checkDNC).toHaveBeenCalledWith('+15551234567');
      expect(redis.set).toHaveBeenCalledWith(
        'dnc:+15551234567',
        JSON.stringify({ blocked: true, reason: 'consumer_request' }),
        'EX',
        900
      );
    });

    it('defaults reason to dnc_list when CRM returns blocked without reason', async () => {
      crm.checkDNC.mockResolvedValue({ blocked: true });
      const result = await gate.checkDNC('+15551234567');
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('dnc_list');
    });

    it('calls CRM + caches result on miss (not blocked)', async () => {
      crm.checkDNC.mockResolvedValue({ blocked: false });
      const result = await gate.checkDNC('+15559999999');
      expect(result.blocked).toBe(false);
      expect(redis.set).toHaveBeenCalled();
    });
  });

  describe('checkTCPAWindow', () => {
    it('allows dialing inside window', () => {
      const now = new Date('2026-04-16T15:30:00Z'); // 10:30 Central
      const result = gate.checkTCPAWindow('America/Chicago', '08:00', '21:00', now);
      expect(result.blocked).toBe(false);
    });

    it('blocks before window opens', () => {
      const now = new Date('2026-04-16T11:15:00Z'); // 06:15 Central
      const result = gate.checkTCPAWindow('America/Chicago', '08:00', '21:00', now);
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('tcpa_window');
    });

    it('blocks after window closes', () => {
      const now = new Date('2026-04-17T03:05:00Z'); // 22:05 Central previous day
      const result = gate.checkTCPAWindow('America/Chicago', '08:00', '21:00', now);
      expect(result.blocked).toBe(true);
    });

    it('allows right at window open', () => {
      const now = new Date('2026-04-16T13:00:00Z'); // 08:00 Central
      const result = gate.checkTCPAWindow('America/Chicago', '08:00', '21:00', now);
      expect(result.blocked).toBe(false);
    });

    it('blocks right at window close', () => {
      const now = new Date('2026-04-17T02:00:00Z'); // 21:00 Central
      const result = gate.checkTCPAWindow('America/Chicago', '08:00', '21:00', now);
      expect(result.blocked).toBe(true);
    });
  });

  describe('checkRegF', () => {
    it('blocks when count >= 7 in last 7 days', async () => {
      crm.getTCPACompliance.mockResolvedValue({ count: 7, lastCallAt: new Date() });
      const result = await gate.checkRegF('acct-1');
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('reg_f_frequency');
    });

    it('allows when count below threshold', async () => {
      crm.getTCPACompliance.mockResolvedValue({ count: 3, lastCallAt: new Date() });
      const result = await gate.checkRegF('acct-1');
      expect(result.blocked).toBe(false);
    });

    it('allows when count is zero and lastCallAt is null', async () => {
      crm.getTCPACompliance.mockResolvedValue({ count: 0, lastCallAt: null });
      const result = await gate.checkRegF('acct-1');
      expect(result.blocked).toBe(false);
    });
  });

  describe('checkAccountStatus', () => {
    it('blocks on cease_and_desist', async () => {
      crm.getAccount.mockResolvedValue({ id: 'a', status: 'cease_and_desist' });
      const result = await gate.checkAccountStatus('a');
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('status_cease_and_desist');
    });

    it('blocks on bankruptcy', async () => {
      crm.getAccount.mockResolvedValue({ id: 'a', status: 'bankruptcy' });
      const result = await gate.checkAccountStatus('a');
      expect(result.blocked).toBe(true);
    });

    it('allows on open status', async () => {
      crm.getAccount.mockResolvedValue({ id: 'a', status: 'open' });
      const result = await gate.checkAccountStatus('a');
      expect(result.blocked).toBe(false);
    });

    it('allows when status is missing', async () => {
      crm.getAccount.mockResolvedValue({ id: 'a' });
      const result = await gate.checkAccountStatus('a');
      expect(result.blocked).toBe(false);
    });
  });

  describe('checkAll', () => {
    it('returns cleared=true when all pass', async () => {
      crm.checkDNC.mockResolvedValue({ blocked: false });
      crm.getTCPACompliance.mockResolvedValue({ count: 0, lastCallAt: null });
      crm.getAccount.mockResolvedValue({ id: 'a', status: 'open' });

      const result = await gate.checkAll(
        { phone: '+15551234567', crmAccountId: 'a', timezone: 'America/Chicago' },
        { dialingHoursStart: '08:00', dialingHoursEnd: '21:00' },
        new Date('2026-04-16T15:30:00Z') // 10:30 Central — inside window
      );

      expect(result.cleared).toBe(true);
      expect(result.reasons).toEqual([]);
    });

    it('aggregates multiple failures', async () => {
      crm.checkDNC.mockResolvedValue({ blocked: true, reason: 'consumer_request' });
      crm.getTCPACompliance.mockResolvedValue({ count: 10, lastCallAt: new Date() });
      crm.getAccount.mockResolvedValue({ id: 'a', status: 'bankruptcy' });

      const result = await gate.checkAll(
        { phone: '+15551234567', crmAccountId: 'a', timezone: 'America/Chicago' },
        { dialingHoursStart: '08:00', dialingHoursEnd: '21:00' },
        new Date('2026-04-17T04:00:00Z') // 23:00 Central — outside window
      );

      expect(result.cleared).toBe(false);
      expect(result.reasons).toContain('consumer_request');
      expect(result.reasons).toContain('tcpa_window');
      expect(result.reasons).toContain('reg_f_frequency');
      expect(result.reasons).toContain('status_bankruptcy');
    });
  });
});
