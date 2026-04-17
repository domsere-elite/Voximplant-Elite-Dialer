import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    user: {
      id: string;
      email: string;
      role: string;
      crmUserId: string;
    };
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      id: string;
      email: string;
      role: string;
      crmUserId: string;
    };
    user: {
      id: string;
      email: string;
      role: string;
      crmUserId: string;
    };
  }
}

export const authenticate: preHandlerHookHandler = async (
  req: FastifyRequest,
  reply: FastifyReply,
) => {
  try {
    await req.jwtVerify();
  } catch {
    return reply.status(401).send({ error: 'unauthorized' });
  }
};

export function requireRole(roles: string[]): preHandlerHookHandler {
  return async (req, reply) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return reply.status(403).send({ error: 'forbidden' });
    }
  };
}
