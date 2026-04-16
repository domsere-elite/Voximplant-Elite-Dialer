import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

const didGroupRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', authenticate);

  app.get('/did-groups', async () => {
    return prisma.dIDGroup.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  });
};

export default didGroupRoutes;
