import { Redis } from 'ioredis';
import { config } from '../config.js';

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on('error', (err: Error) => {
  // eslint-disable-next-line no-console
  console.error('[redis] error', err.message);
});
