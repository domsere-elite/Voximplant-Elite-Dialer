import { describe, it, expect } from 'vitest';
import { logger, createChildLogger } from '../src/lib/logger.js';

describe('logger', () => {
  it('exports a winston logger instance', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('has a configurable log level', () => {
    expect(typeof logger.level).toBe('string');
    expect(logger.level.length).toBeGreaterThan(0);
  });

  it('logs without throwing', () => {
    expect(() => logger.info('test info message')).not.toThrow();
    expect(() => logger.warn('test warn message')).not.toThrow();
    expect(() => logger.error('test error message', { err: 'details' })).not.toThrow();
  });
});

describe('createChildLogger', () => {
  it('creates a child logger bound to a request id', () => {
    const child = createChildLogger('req-abc-123');
    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
    expect(() => child.info('child log line')).not.toThrow();
  });

  it('accepts additional metadata', () => {
    const child = createChildLogger('req-xyz', { userId: 'user-1' });
    expect(child).toBeDefined();
    expect(() => child.info('metadata test')).not.toThrow();
  });
});
