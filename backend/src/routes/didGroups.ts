import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { PHONE_NUMBER_SELECT_FIELDS } from './phoneNumbers.js';

const createGroupBody = z
  .object({
    name: z.string().min(1),
  })
  .strict();

const assignBody = z
  .object({
    phoneNumberId: z.string().uuid(),
  })
  .strict();

const didGroupRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', authenticate);

  app.get('/did-groups', async () => {
    const rows = await prisma.dIDGroup.findMany({
      select: {
        id: true,
        name: true,
        phoneNumbers: { select: PHONE_NUMBER_SELECT_FIELDS },
      },
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      numbers: row.phoneNumbers,
    }));
  });

  app.post(
    '/did-groups',
    { preHandler: requireRole(['admin']) },
    async (req, reply) => {
      const parsed = createGroupBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'validation', issues: parsed.error.issues });
      }
      const created = await prisma.dIDGroup.create({
        data: { name: parsed.data.name },
        select: { id: true, name: true },
      });
      return reply.status(201).send({ ...created, numbers: [] });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/did-groups/:id/numbers',
    { preHandler: requireRole(['admin']) },
    async (req, reply) => {
      const parsed = assignBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'validation', issues: parsed.error.issues });
      }
      const group = await prisma.dIDGroup.findUnique({ where: { id: req.params.id } });
      if (!group) return reply.status(404).send({ error: 'group not found' });
      const number = await prisma.phoneNumber.findUnique({
        where: { id: parsed.data.phoneNumberId },
      });
      if (!number) return reply.status(404).send({ error: 'number not found' });
      await prisma.phoneNumber.update({
        where: { id: parsed.data.phoneNumberId },
        data: { didGroupId: req.params.id },
      });
      return reply.status(200).send({ ok: true });
    },
  );

  app.delete<{ Params: { id: string; numberId: string } }>(
    '/did-groups/:id/numbers/:numberId',
    { preHandler: requireRole(['admin']) },
    async (req, reply) => {
      const number = await prisma.phoneNumber.findUnique({
        where: { id: req.params.numberId },
      });
      if (!number || number.didGroupId !== req.params.id) {
        return reply.status(404).send({ error: 'not found' });
      }
      await prisma.phoneNumber.update({
        where: { id: req.params.numberId },
        data: { didGroupId: null },
      });
      return reply.status(200).send({ ok: true });
    },
  );
};

export default didGroupRoutes;
