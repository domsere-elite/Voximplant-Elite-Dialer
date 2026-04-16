import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

export const agentRouter = Router();
agentRouter.use(authenticate);

// List all agents with their current status
agentRouter.get('/', requireRole('supervisor', 'admin'), async (_req: AuthRequest, res: Response) => {
  const agents = await prisma.user.findMany({
    where: { role: { in: ['agent', 'supervisor'] } },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      status: true,
      extension: true,
      isActive: true,
      lastLoginAt: true,
    },
    orderBy: { firstName: 'asc' },
  });
  res.json({ agents });
});

// Get single agent
agentRouter.get('/:id', requireRole('supervisor', 'admin'), async (req: AuthRequest, res: Response) => {
  const agent = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      status: true,
      extension: true,
      isActive: true,
      lastLoginAt: true,
      _count: { select: { calls: true } },
    },
  });

  if (!agent) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }
  res.json({ agent });
});

// Update agent status (agent can update their own, supervisor+ can update any)
agentRouter.patch('/:id/status', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  const validStatuses = ['available', 'busy', 'on_call', 'wrap_up', 'offline', 'break'];

  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    return;
  }

  // Agents can only update their own status
  if (req.user!.role === 'agent' && id !== req.user!.id) {
    res.status(403).json({ error: 'Cannot update another agent\'s status' });
    return;
  }

  const agent = await prisma.user.update({
    where: { id },
    data: { status },
    select: { id: true, status: true, firstName: true, lastName: true },
  });

  res.json({ agent });
});

// Toggle agent active/inactive (admin only)
agentRouter.patch('/:id/active', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { isActive } = req.body;

  const agent = await prisma.user.update({
    where: { id },
    data: { isActive },
    select: { id: true, isActive: true, firstName: true, lastName: true },
  });

  res.json({ agent });
});
