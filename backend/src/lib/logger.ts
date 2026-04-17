import winston from 'winston';
import { config } from '../config.js';

const { combine, timestamp, printf, colorize, errors, json, splat } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss.SSS' }),
  errors({ stack: true }),
  splat(),
  printf(({ level, message, timestamp: ts, requestId, ...meta }) => {
    const reqPart = requestId ? ` [${String(requestId)}]` : '';
    const metaKeys = Object.keys(meta).filter((k) => k !== 'service');
    const metaPart =
      metaKeys.length > 0
        ? ` ${JSON.stringify(Object.fromEntries(metaKeys.map((k) => [k, meta[k]])))}`
        : '';
    return `${ts} ${level}${reqPart} ${message}${metaPart}`;
  }),
);

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  splat(),
  json(),
);

export const logger = winston.createLogger({
  level: config.logging.level,
  format: config.server.isProduction ? prodFormat : devFormat,
  defaultMeta: { service: 'elite-dialer-backend' },
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
  exitOnError: false,
});

export function createChildLogger(
  requestId: string,
  extra: Record<string, unknown> = {},
): winston.Logger {
  return logger.child({ requestId, ...extra });
}

export type AppLogger = typeof logger;
