import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../src/lib/redis.js', () => ({
  redis: {
    ping: vi.fn().mockResolvedValue('PONG'),
    quit: vi.fn().mockResolvedValue('OK'),
    duplicate: vi.fn().mockReturnValue({
      status: 'ready',
      connect: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue('OK'),
      on: vi.fn(),
    }),
    on: vi.fn(),
  },
}));

vi.mock('@socket.io/redis-adapter', () => ({
  createAdapter: vi.fn().mockReturnValue(() => {}),
}));

// Ensure required env vars are set before importing the server module
process.env.NODE_ENV = 'development';
process.env.DATABASE_URL = 'postgresql://test';
process.env.JWT_SECRET = 'test-secret';
process.env.VOXIMPLANT_ACCOUNT_ID = 'test';
process.env.VOXIMPLANT_API_KEY_ID = 'test';
process.env.VOXIMPLANT_APPLICATION_ID = 'test';
process.env.VOXIMPLANT_APPLICATION_NAME = 'test';
process.env.VOXIMPLANT_ACCOUNT_NAME = 'test';
process.env.CRM_BASE_URL = 'http://test';
process.env.CRM_API_KEY = 'test';

import { buildServer } from '../src/index.js';
import { prisma } from '../src/lib/prisma.js';
import { redis } from '../src/lib/redis.js';

describe('GET /health', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with db+redis ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe('ok');
    expect(body.redis).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  it('returns 503 when db is down', async () => {
    (prisma.$queryRaw as any).mockRejectedValueOnce(new Error('db down'));
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.status).toBe('degraded');
    expect(body.db).toBe('error');
  });

  it('returns 503 when redis is down', async () => {
    (redis.ping as any).mockRejectedValueOnce(new Error('redis down'));
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.redis).toBe('error');
  });
});
