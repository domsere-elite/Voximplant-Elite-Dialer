import { Request, Response, NextFunction } from 'express';

const windowMs = 60 * 1000; // 1 minute
const maxRequests = 100;
const cleanupIntervalMs = 60 * 1000; // Clean up stale entries every 60s

const clients = new Map<string, { count: number; resetAt: number }>();

// Periodic cleanup to prevent memory leak from stale entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, client] of clients) {
    if (now > client.resetAt) {
      clients.delete(ip);
    }
  }
}, cleanupIntervalMs).unref();

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  // Skip rate limiting for health checks and webhooks
  if (req.path === '/health' || req.path.startsWith('/api/webhooks')) {
    next();
    return;
  }

  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  let client = clients.get(ip);
  if (!client || now > client.resetAt) {
    client = { count: 0, resetAt: now + windowMs };
    clients.set(ip, client);
  }

  client.count++;

  if (client.count > maxRequests) {
    res.status(429).json({ error: 'Too many requests' });
    return;
  }

  next();
}
