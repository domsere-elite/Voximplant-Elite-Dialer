import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

export const reportRouter = Router();
reportRouter.use(authenticate);
reportRouter.use(requireRole('supervisor', 'admin'));

// Dashboard summary
reportRouter.get('/dashboard', async (_req: AuthRequest, res: Response) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    totalCallsToday,
    totalCallsAll,
    avgDurationToday,
    activeCampaigns,
    availableAgents,
    dispositionBreakdown,
  ] = await Promise.all([
    prisma.call.count({ where: { createdAt: { gte: today } } }),
    prisma.call.count(),
    prisma.call.aggregate({
      where: { createdAt: { gte: today }, duration: { gt: 0 } },
      _avg: { duration: true },
    }),
    prisma.campaign.count({ where: { status: 'active' } }),
    prisma.user.count({
      where: { role: { in: ['agent', 'supervisor'] }, status: 'available', isActive: true },
    }),
    prisma.call.groupBy({
      by: ['dispositionCode'],
      where: { createdAt: { gte: today }, dispositionCode: { not: null } },
      _count: true,
    }),
  ]);

  res.json({
    totalCallsToday,
    totalCallsAll,
    avgDurationToday: avgDurationToday._avg.duration || 0,
    activeCampaigns,
    availableAgents,
    dispositionBreakdown,
  });
});

// Campaign performance report
reportRouter.get('/campaigns/:id', async (req: AuthRequest, res: Response) => {
  const campaignId = req.params.id;

  const [campaign, attempts, contactStats] = await Promise.all([
    prisma.campaign.findUnique({ where: { id: campaignId } }),
    prisma.campaignAttempt.groupBy({
      by: ['outcome'],
      where: { campaignId },
      _count: true,
    }),
    prisma.campaignContact.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: true,
    }),
  ]);

  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  res.json({ campaign, attempts, contactStats });
});

// Agent performance report
reportRouter.get('/agents', async (req: AuthRequest, res: Response) => {
  const since = req.query.since
    ? new Date(req.query.since as string)
    : (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

  const agentStats = await prisma.call.groupBy({
    by: ['agentId'],
    where: {
      agentId: { not: null },
      createdAt: { gte: since },
    },
    _count: true,
    _avg: { duration: true },
  });

  // Enrich with agent names
  const agentIds = agentStats.map((s) => s.agentId).filter(Boolean) as string[];
  const agents = await prisma.user.findMany({
    where: { id: { in: agentIds } },
    select: { id: true, firstName: true, lastName: true },
  });

  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const enriched = agentStats.map((s) => ({
    agent: agentMap.get(s.agentId!) || { id: s.agentId, firstName: 'Unknown', lastName: '' },
    callCount: s._count,
    avgDuration: s._avg.duration || 0,
  }));

  res.json({ agentStats: enriched, since });
});

// Compliance report
reportRouter.get('/compliance', async (_req: AuthRequest, res: Response) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [dncBlocked, tcpaBlocked, regfBlocked, totalAttempts] = await Promise.all([
    prisma.complianceLog.count({
      where: { checkType: 'dnc', result: 'blocked', createdAt: { gte: sevenDaysAgo } },
    }),
    prisma.complianceLog.count({
      where: { checkType: 'tcpa', result: 'blocked', createdAt: { gte: sevenDaysAgo } },
    }),
    prisma.complianceLog.count({
      where: { checkType: 'reg_f', result: 'blocked', createdAt: { gte: sevenDaysAgo } },
    }),
    prisma.campaignAttempt.count({
      where: { createdAt: { gte: sevenDaysAgo } },
    }),
  ]);

  res.json({
    period: '7d',
    dncBlocked,
    tcpaBlocked,
    regfBlocked,
    totalAttempts,
    complianceRate: totalAttempts > 0
      ? ((totalAttempts - dncBlocked - tcpaBlocked - regfBlocked) / totalAttempts * 100).toFixed(2)
      : '100.00',
  });
});
