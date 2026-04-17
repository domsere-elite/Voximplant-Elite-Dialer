import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';

export const PHONE_NUMBER_SELECT_FIELDS = {
  id: true,
  number: true,
  voximplantNumberId: true,
  didGroupId: true,
  areaCode: true,
  state: true,
  isActive: true,
  healthScore: true,
  dailyCallCount: true,
  dailyCallLimit: true,
  lastUsedAt: true,
  cooldownUntil: true,
} as const;

const E164 = /^\+[1-9]\d{6,14}$/;
const AREA_CODE = /^\d{3}$/;
const STATE_CODE = /^[A-Z]{2}$/;

const createBody = z
  .object({
    number: z.string().regex(E164),
    voximplantNumberId: z.number().int().optional().nullable(),
    areaCode: z.string().regex(AREA_CODE),
    state: z.string().regex(STATE_CODE).optional().nullable(),
    didGroupId: z.string().uuid().optional().nullable(),
  })
  .strict();

const patchBody = z
  .object({
    isActive: z.boolean().optional(),
    dailyCallLimit: z.number().int().min(0).optional(),
    cooldownUntil: z.coerce.date().nullable().optional(),
    didGroupId: z.string().uuid().nullable().optional(),
  })
  .strict();

const phoneNumberRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', authenticate);

  app.get('/phone-numbers', async () => {
    return prisma.phoneNumber.findMany({
      select: PHONE_NUMBER_SELECT_FIELDS,
      orderBy: { number: 'asc' },
    });
  });

  app.post(
    '/phone-numbers',
    { preHandler: requireRole(['admin']) },
    async (req, reply) => {
      const parsed = createBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'validation', issues: parsed.error.issues });
      }
      const data: Prisma.PhoneNumberUncheckedCreateInput = {
        number: parsed.data.number,
        voximplantNumberId: parsed.data.voximplantNumberId ?? undefined,
        areaCode: parsed.data.areaCode,
        state: parsed.data.state ?? undefined,
        didGroupId: parsed.data.didGroupId ?? undefined,
      };
      const created = await prisma.phoneNumber.create({
        data,
        select: PHONE_NUMBER_SELECT_FIELDS,
      });
      return reply.status(201).send(created);
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/phone-numbers/:id',
    { preHandler: requireRole(['admin']) },
    async (req, reply) => {
      const parsed = patchBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'validation', issues: parsed.error.issues });
      }
      const existing = await prisma.phoneNumber.findUnique({ where: { id: req.params.id } });
      if (!existing) return reply.status(404).send({ error: 'not found' });

      const data: Prisma.PhoneNumberUpdateInput = {};
      if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;
      if (parsed.data.dailyCallLimit !== undefined) data.dailyCallLimit = parsed.data.dailyCallLimit;
      if (parsed.data.cooldownUntil !== undefined) data.cooldownUntil = parsed.data.cooldownUntil;
      if (parsed.data.didGroupId !== undefined) {
        data.didGroup = parsed.data.didGroupId
          ? { connect: { id: parsed.data.didGroupId } }
          : { disconnect: true };
      }

      const updated = await prisma.phoneNumber.update({
        where: { id: req.params.id },
        data,
        select: PHONE_NUMBER_SELECT_FIELDS,
      });
      return updated;
    },
  );
};

export default phoneNumberRoutes;
