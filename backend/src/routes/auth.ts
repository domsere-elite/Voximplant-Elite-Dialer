import type { FastifyInstance } from 'fastify';
import { AgentStatus } from '@prisma/client';
import { crmClient } from '../lib/crm-client.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { authenticate } from '../middleware/auth.js';
import { config } from '../config.js';

interface LoginBody {
  email: string;
  password: string;
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: LoginBody }>('/api/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (req, reply) => {
    const { email, password } = req.body;

    const crmUser = await crmClient.verifyLogin(email, password);
    if (!crmUser) {
      return reply.status(401).send({ error: 'invalid_credentials' });
    }

    const mapping = await prisma.agentMapping.findUnique({
      where: { crmUserId: crmUser.id },
    });
    if (!mapping) {
      logger.warn('login: no agent mapping', { crmUserId: crmUser.id });
      return reply.status(403).send({ error: 'agent_mapping_missing' });
    }

    const token = app.jwt.sign(
      {
        id: crmUser.id,
        email: crmUser.email,
        role: crmUser.role,
        crmUserId: crmUser.id,
      },
      { expiresIn: config.jwt.expiresIn ?? '8h' },
    );

    // Voximplant one-time key wired in Task 9 via VoximplantAPI.createOneTimeLoginKey
    const oneTimeKey = '';

    return reply.status(200).send({
      token,
      user: {
        id: crmUser.id,
        email: crmUser.email,
        role: crmUser.role,
        name: (crmUser as { name?: string }).name,
      },
      voximplantUser: {
        userId: mapping.voximplantUserId,
        username: mapping.voximplantUsername,
        oneTimeKey,
      },
    });
  });

  app.post('/api/auth/logout', { preHandler: authenticate }, async (req, reply) => {
    try {
      await prisma.agentMapping.update({
        where: { crmUserId: req.user.crmUserId },
        data: { status: AgentStatus.OFFLINE, currentCallId: null },
      });
    } catch (err) {
      logger.warn('logout: mapping update failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
    return reply.status(200).send({ ok: true });
  });
}
