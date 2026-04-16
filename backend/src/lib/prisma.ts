import { PrismaClient, Prisma } from '@prisma/client';
import { config } from '../config.js';
import { logger } from './logger.js';

const globalForPrisma = globalThis as unknown as {
  __elitePrismaClient?: PrismaClient;
};

function buildClient(): PrismaClient {
  const logLevels: Prisma.LogLevel[] = config.server.isProduction
    ? ['error', 'warn']
    : ['query', 'info', 'warn', 'error'];

  const client = new PrismaClient({
    log: logLevels.map((level) => ({ emit: 'event', level })) as never,
    errorFormat: config.server.isProduction ? 'minimal' : 'pretty',
  });

  // Wire Prisma events into winston. Query logs are dev-only.
  if (!config.server.isProduction) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).$on('query', (e: Prisma.QueryEvent) => {
      logger.debug('prisma:query', {
        query: e.query,
        params: e.params,
        duration_ms: e.duration,
      });
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).$on('error', (e: Prisma.LogEvent) => {
    logger.error('prisma:error', { message: e.message, target: e.target });
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).$on('warn', (e: Prisma.LogEvent) => {
    logger.warn('prisma:warn', { message: e.message, target: e.target });
  });

  return client;
}

export const prisma: PrismaClient =
  globalForPrisma.__elitePrismaClient ?? buildClient();

if (!config.server.isProduction) {
  globalForPrisma.__elitePrismaClient = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info('Prisma client disconnected');
  } catch (err) {
    logger.error('Error disconnecting Prisma client', { err });
  }
}

// Graceful shutdown hooks (only register once per process).
const shutdownSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
for (const sig of shutdownSignals) {
  process.once(sig, () => {
    void disconnectPrisma().finally(() => {
      // Do not call process.exit here — let the main server trigger shutdown.
    });
  });
}
