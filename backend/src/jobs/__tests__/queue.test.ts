import { describe, it, expect, vi } from 'vitest';

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation((name: string, opts: { connection: unknown }) => ({ name, opts })),
  Worker: vi.fn().mockImplementation((name: string, processor: unknown, opts: { connection: unknown }) => ({ name, processor, opts })),
}));

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(() => ({ status: 'ready' })),
}));

vi.mock('../../config.js', () => ({ config: { redis: { url: 'redis://localhost:6379' } } }));

import { createQueue, createWorker } from '../queue.js';

describe('queue helpers', () => {
  it('createQueue returns Queue with shared connection', () => {
    const q = createQueue('test-q') as unknown as { name: string; opts: { connection: unknown } };
    expect(q.name).toBe('test-q');
    expect(q.opts.connection).toBeDefined();
  });

  it('createWorker returns Worker bound to same connection', () => {
    const w = createWorker('test-w', async () => undefined) as unknown as { name: string; opts: { connection: unknown } };
    expect(w.name).toBe('test-w');
    expect(w.opts.connection).toBeDefined();
  });
});
