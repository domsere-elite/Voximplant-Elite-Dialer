import { Queue } from 'bullmq';
import { config } from '../config.js';

const connection = { url: config.redis.url };

export const campaignQueue = new Queue('campaigns', {
  connection: connection as never,
});

export const syncQueue = new Queue('sync-call-outcome', {
  connection: connection as never,
});

export function createQueue(name: string): Queue {
  return new Queue(name, { connection: connection as never });
}
