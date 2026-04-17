import type { Redis } from 'ioredis';
import type { CRMClient } from '../lib/crm-client.js';

const DNC_CACHE_TTL_SECONDS = 900;
const REG_F_MAX_CALLS_7_DAYS = 7;

const BLOCKED_STATUSES = new Set([
  'cease_and_desist',
  'bankruptcy',
  'deceased',
  'legal_threat',
  'fraud_claim',
  'litigation_scrub',
  'litigious_scrub',
  'recalled_to_client',
  'sold',
  'paid_in_full',
  'settled_in_full',
]);

export interface CheckResult {
  blocked: boolean;
  reason?: string;
}

export interface CheckAllContactInput {
  phone: string;
  crmAccountId: string;
  timezone: string;
}

export interface CheckAllCampaignInput {
  dialingHoursStart: string;
  dialingHoursEnd: string;
}

export interface CheckAllResult {
  cleared: boolean;
  reasons: string[];
}

export class ComplianceGate {
  constructor(private readonly crm: CRMClient, private readonly redis: Redis) {}

  async checkDNC(phone: string): Promise<CheckResult> {
    const cacheKey = `dnc:${phone}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as CheckResult;
      } catch {
        // fall through on corrupted cache
      }
    }

    const dnc = await this.crm.checkDNC(phone);
    const result: CheckResult = dnc.blocked
      ? { blocked: true, reason: dnc.reason ?? 'dnc_list' }
      : { blocked: false };
    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', DNC_CACHE_TTL_SECONDS);
    return result;
  }

  checkTCPAWindow(
    timezone: string,
    dialingHoursStart: string,
    dialingHoursEnd: string,
    now: Date = new Date(),
  ): CheckResult {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });
    const parts = formatter.formatToParts(now);
    const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
    const current = toMinutes(`${hh === '24' ? '00' : hh}:${mm}`);
    const start = toMinutes(dialingHoursStart);
    const end = toMinutes(dialingHoursEnd);

    if (current < start || current >= end) {
      return { blocked: true, reason: 'tcpa_window' };
    }
    return { blocked: false };
  }

  async checkRegF(crmAccountId: string): Promise<CheckResult> {
    const data = await this.crm.getTCPACompliance(crmAccountId);
    const count = data?.count ?? 0;
    if (count >= REG_F_MAX_CALLS_7_DAYS) {
      return { blocked: true, reason: 'reg_f_frequency' };
    }
    return { blocked: false };
  }

  async checkAccountStatus(crmAccountId: string): Promise<CheckResult> {
    const account = await this.crm.getAccount(crmAccountId);
    const status = account?.status ?? '';
    if (status && BLOCKED_STATUSES.has(status)) {
      return { blocked: true, reason: `status_${status}` };
    }
    return { blocked: false };
  }

  async checkAll(
    contact: CheckAllContactInput,
    campaign: CheckAllCampaignInput,
    now: Date = new Date(),
  ): Promise<CheckAllResult> {
    const [dnc, regF, status] = await Promise.all([
      this.checkDNC(contact.phone),
      this.checkRegF(contact.crmAccountId),
      this.checkAccountStatus(contact.crmAccountId),
    ]);
    const tcpa = this.checkTCPAWindow(
      contact.timezone,
      campaign.dialingHoursStart,
      campaign.dialingHoursEnd,
      now,
    );

    const reasons: string[] = [];
    for (const r of [dnc, tcpa, regF, status]) {
      if (r.blocked && r.reason) reasons.push(r.reason);
    }
    return { cleared: reasons.length === 0, reasons };
  }
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((v) => Number.parseInt(v, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

// Singleton wired from shared infrastructure
import { crmClient } from '../lib/crm-client.js';
import { redis } from '../lib/redis.js';
export const complianceGate = new ComplianceGate(crmClient, redis);
