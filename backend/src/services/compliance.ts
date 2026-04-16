import { prisma } from '../lib/prisma';
import { config } from '../config';
import { logger } from '../lib/logger';

interface ComplianceCheckResult {
  allowed: boolean;
  blocked?: boolean;
  reason?: string;
  details?: Record<string, any>;
}

class ComplianceService {
  /**
   * Check if a phone number is on the Do Not Call list.
   */
  async checkDNC(phone: string): Promise<ComplianceCheckResult> {
    const entry = await prisma.dNCEntry.findUnique({ where: { phone } });
    const result = {
      allowed: !entry,
      blocked: !!entry,
      reason: entry ? `DNC: ${entry.reason || 'On Do Not Call list'}` : undefined,
    };

    await this.logCheck('dnc', result.allowed ? 'allowed' : 'blocked', { phone });
    return result;
  }

  /**
   * Check TCPA calling window (8am-9pm in consumer's local timezone).
   */
  checkTCPAWindow(phone: string, contactTimezone?: string): ComplianceCheckResult {
    const tz = contactTimezone || config.compliance.tcpaDefaultTimezone;

    let currentHour: number;
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: 'numeric',
        hour12: false,
      });
      currentHour = parseInt(formatter.format(new Date()), 10);
    } catch {
      // Invalid timezone — default to safe timezone
      logger.warn(`Invalid timezone "${tz}", defaulting to ${config.compliance.tcpaDefaultTimezone}`);
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: config.compliance.tcpaDefaultTimezone,
        hour: 'numeric',
        hour12: false,
      });
      currentHour = parseInt(formatter.format(new Date()), 10);
    }

    const startHour = config.compliance.tcpaWindowStartHour;
    const endHour = config.compliance.tcpaWindowEndHour;
    const allowed = currentHour >= startHour && currentHour < endHour;

    const result = {
      allowed,
      blocked: !allowed,
      reason: !allowed
        ? `TCPA: Outside calling window (${startHour}:00-${endHour}:00 ${tz}, current hour: ${currentHour})`
        : undefined,
      details: { timezone: tz, currentHour, windowStart: startHour, windowEnd: endHour },
    };

    // Fire-and-forget log
    this.logCheck('tcpa', allowed ? 'allowed' : 'blocked', { phone, ...result.details }).catch(() => {});
    return result;
  }

  /**
   * Reg F: Check if we've exceeded 7 calls to this contact in the past 7 days.
   * CFPB Regulation F limits debt collectors to 7 call attempts per debt per 7-day period.
   */
  async checkRegF(contactId: string): Promise<ComplianceCheckResult> {
    const windowStart = new Date(
      Date.now() - config.compliance.regfWindowDays * 24 * 60 * 60 * 1000
    );

    const recentCalls = await prisma.regFTracker.count({
      where: {
        contactId,
        calledAt: { gte: windowStart },
      },
    });

    const maxCalls = config.compliance.regfMaxCallsPerDebt;
    const allowed = recentCalls < maxCalls;

    const result = {
      allowed,
      blocked: !allowed,
      reason: !allowed
        ? `Reg F: ${recentCalls}/${maxCalls} calls in ${config.compliance.regfWindowDays}-day window`
        : undefined,
      details: {
        recentCalls,
        maxCalls,
        windowDays: config.compliance.regfWindowDays,
        remainingCalls: Math.max(0, maxCalls - recentCalls),
      },
    };

    await this.logCheck('reg_f', allowed ? 'allowed' : 'blocked', { contactId, ...result.details });
    return result;
  }

  /**
   * Record a Reg F call attempt for tracking.
   */
  async recordRegFAttempt(contactId: string, callId: string): Promise<void> {
    await prisma.regFTracker.create({
      data: { contactId, callId },
    });
  }

  /**
   * Run all compliance checks for a contact before dialing.
   */
  async runAllChecks(
    phone: string,
    contactId?: string,
    contactTimezone?: string
  ): Promise<{ allowed: boolean; failures: ComplianceCheckResult[] }> {
    const failures: ComplianceCheckResult[] = [];

    // 1. DNC check
    const dnc = await this.checkDNC(phone);
    if (!dnc.allowed) failures.push(dnc);

    // 2. TCPA window check
    const tcpa = this.checkTCPAWindow(phone, contactTimezone);
    if (!tcpa.allowed) failures.push(tcpa);

    // 3. Reg F check (if we have a contact ID)
    if (contactId) {
      const regf = await this.checkRegF(contactId);
      if (!regf.allowed) failures.push(regf);
    }

    return {
      allowed: failures.length === 0,
      failures,
    };
  }

  /**
   * Get Reg F status summary for a contact (useful for UI display).
   */
  async getRegFStatus(contactId: string): Promise<{
    callsInWindow: number;
    maxCalls: number;
    remaining: number;
    windowDays: number;
    nextAllowedAt: Date | null;
  }> {
    const windowStart = new Date(
      Date.now() - config.compliance.regfWindowDays * 24 * 60 * 60 * 1000
    );

    const trackers = await prisma.regFTracker.findMany({
      where: { contactId, calledAt: { gte: windowStart } },
      orderBy: { calledAt: 'asc' },
    });

    const maxCalls = config.compliance.regfMaxCallsPerDebt;
    const remaining = Math.max(0, maxCalls - trackers.length);

    // Calculate when the oldest call in the window will expire
    let nextAllowedAt: Date | null = null;
    if (remaining === 0 && trackers.length > 0) {
      const oldest = trackers[0];
      nextAllowedAt = new Date(
        oldest.calledAt.getTime() + config.compliance.regfWindowDays * 24 * 60 * 60 * 1000
      );
    }

    return {
      callsInWindow: trackers.length,
      maxCalls,
      remaining,
      windowDays: config.compliance.regfWindowDays,
      nextAllowedAt,
    };
  }

  private async logCheck(
    checkType: string,
    result: string,
    details: Record<string, any>
  ): Promise<void> {
    try {
      await prisma.complianceLog.create({
        data: {
          checkType,
          result,
          phone: details.phone,
          contactId: details.contactId,
          details,
        },
      });
    } catch (err) {
      logger.error('Failed to log compliance check:', err);
    }
  }
}

export const complianceService = new ComplianceService();
