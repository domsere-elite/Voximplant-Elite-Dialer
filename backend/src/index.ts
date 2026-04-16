import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import jwt from 'jsonwebtoken';
import { Server as SocketServer } from 'socket.io';
import { config } from './config';
import { logger } from './lib/logger';
import { AuthUser } from './middleware/auth';
import { authRouter } from './routes/auth';
import { agentRouter } from './routes/agents';
import { campaignRouter } from './routes/campaigns';
import { callRouter } from './routes/calls';
import { reportRouter } from './routes/reports';
import { voximplantWebhookRouter } from './routes/voximplant-webhooks';
import { systemRouter } from './routes/system';
import { errorHandler } from './middleware/error-handler';
import { rateLimiter } from './middleware/rate-limiter';

const app = express();
const server = http.createServer(app);

// WebSocket server for real-time updates (improvement over EliteDial's polling)
export const io = new SocketServer(server, {
  cors: {
    origin: config.frontend.url,
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(helmet());
app.use(cors({ origin: config.frontend.url, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(rateLimiter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/agents', agentRouter);
app.use('/api/campaigns', campaignRouter);
app.use('/api/calls', callRouter);
app.use('/api/reports', reportRouter);
app.use('/api/webhooks/voximplant', voximplantWebhookRouter);
app.use('/api/system', systemRouter);

// Error handling
app.use(errorHandler);

// WebSocket authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) {
    next(new Error('Authentication required'));
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as AuthUser;
    socket.data.user = decoded;
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
});

// WebSocket connection handling
io.on('connection', (socket) => {
  const user = socket.data.user as AuthUser;
  logger.info(`WebSocket client connected: ${socket.id} (user: ${user.id})`);

  // Auto-join agent's own room
  socket.join(`agent:${user.id}`);

  // Only supervisors/admins can join the supervisors room
  if (user.role === 'supervisor' || user.role === 'admin') {
    socket.join('supervisors');
  }

  socket.on('join:campaign', (campaignId: string) => {
    socket.join(`campaign:${campaignId}`);
  });

  socket.on('disconnect', () => {
    logger.info(`WebSocket client disconnected: ${socket.id}`);
  });
});

server.listen(config.port, () => {
  logger.info(`Server running on port ${config.port} in ${config.env} mode`);
});

export default app;
