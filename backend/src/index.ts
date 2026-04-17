import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import { Server as IOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { setIO } from './lib/io.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerWebhookRoutes } from './routes/webhooks.js';
import campaignRoutes from './routes/campaigns.js';
import campaignContactRoutes from './routes/campaignContacts.js';
import phoneNumberRoutes from './routes/phoneNumbers.js';
import didGroupRoutes from './routes/didGroups.js';
import callsRoutes from './routes/calls.js';
import reportsRoutes from './routes/reports.js';
import settingsRoutes from './routes/settings.js';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, trustProxy: true });

  await app.register(cors, {
    origin: config.frontend.url,
    credentials: true,
  });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(jwt, { secret: config.jwt.secret });

  app.get('/health', async (_req, reply) => {
    const result: Record<string, string | number> = {
      status: 'ok',
      db: 'ok',
      redis: 'ok',
      timestamp: Date.now(),
    };

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      result.db = 'error';
      result.status = 'degraded';
      logger.error('health: db check failed', { err: err instanceof Error ? err.message : String(err) });
    }

    try {
      const pong = await redis.ping();
      if (pong !== 'PONG') {
        result.redis = 'error';
        result.status = 'degraded';
      }
    } catch (err) {
      result.redis = 'error';
      result.status = 'degraded';
      logger.error('health: redis check failed', { err: err instanceof Error ? err.message : String(err) });
    }

    if (result.status === 'degraded') {
      return reply.status(503).send(result);
    }
    return reply.status(200).send(result);
  });

  await registerAuthRoutes(app);
  await registerWebhookRoutes(app);
  await app.register(campaignRoutes, { prefix: '/api' });
  await app.register(campaignContactRoutes, { prefix: '/api' });
  await app.register(phoneNumberRoutes, { prefix: '/api' });
  await app.register(didGroupRoutes, { prefix: '/api' });
  await app.register(callsRoutes, { prefix: '/api' });
  await app.register(reportsRoutes, { prefix: '/api/reports' });
  await app.register(settingsRoutes, { prefix: '/api/settings' });

  return app;
}

export async function attachSocketIO(app: FastifyInstance): Promise<IOServer> {
  const io = new IOServer(app.server, {
    cors: { origin: config.frontend.url, credentials: true },
  });

  const pub = redis.duplicate();
  const sub = redis.duplicate();

  // Wait for pub/sub connections to be ready if not already
  const ensureReady = async (client: ReturnType<typeof redis.duplicate>): Promise<void> => {
    const c = client as unknown as { status: string; connect: () => Promise<void> };
    if (c.status === 'ready' || c.status === 'connect') {
      return;
    }
    await c.connect();
  };

  await Promise.all([ensureReady(pub), ensureReady(sub)]);
  io.adapter(createAdapter(pub, sub));

  setIO(io);
  return io;
}

async function start(): Promise<void> {
  const app = await buildServer();
  await attachSocketIO(app);

  await app.listen({ host: '0.0.0.0', port: config.server.port });
  logger.info('elite-dialer backend started', {
    port: config.server.port,
    env: config.server.nodeEnv,
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info('shutdown initiated', { signal });
    try {
      await app.close();
      await prisma.$disconnect();
      await redis.quit();
    } catch (err) {
      logger.error('shutdown error', { err: err instanceof Error ? err.message : String(err) });
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

// ESM equivalent of `require.main === module` check.
// Only start the server when this file is run directly (not imported by tests).
const isMainModule = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`;
if (isMainModule) {
  start().catch((err) => {
    logger.error('startup failed', { err: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
}
