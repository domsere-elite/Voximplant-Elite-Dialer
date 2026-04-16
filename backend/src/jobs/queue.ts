import { Queue, Worker, type QueueOptions, type WorkerOptions, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../config.js';

let connection: Redis | undefined;

function getConnection(): Redis {
  if (!connection) {
    connection = new Redis(config.redis.url, { maxRetriesPerRequest: null });
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return connection!;
}

export function createQueue(name: string, opts?: Partial<QueueOptions>): Queue {
  return new Queue(name, { connection: getConnection(), ...(opts ?? {}) });
}

export function createWorker<T = unknown>(
  name: string,
  processor: (job: Job<T>) => Promise<unknown>,
  opts?: Partial<WorkerOptions>,
): Worker<T> {
  return new Worker<T>(name, processor, { connection: getConnection(), ...(opts ?? {}) });
}

export const campaignQueue = createQueue('campaigns');
export const syncCallOutcomeQueue = createQueue('sync-call-outcome');
export const complianceQueue = createQueue('compliance');
export const didQueue = createQueue('did-health');
export const progressQueue = createQueue('campaign-progress');
export const syncQueue = syncCallOutcomeQueue;
