import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('config helpers', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset modules so config.ts re-reads env
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('required()', () => {
    it('returns value when env var is set', async () => {
      process.env.NODE_ENV = 'development';
      process.env.TEST_REQUIRED_VAR = 'hello';
      const { required } = await import('../src/config.js');
      expect(required('TEST_REQUIRED_VAR')).toBe('hello');
    });

    it('throws when missing in production', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.TEST_MISSING_VAR;
      const { required } = await import('../src/config.js');
      expect(() => required('TEST_MISSING_VAR')).toThrow(
        /TEST_MISSING_VAR/,
      );
    });

    it('returns empty string when missing in non-production (warns)', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.TEST_MISSING_VAR;
      const { required } = await import('../src/config.js');
      expect(required('TEST_MISSING_VAR')).toBe('');
    });
  });

  describe('optional()', () => {
    it('returns value when set', async () => {
      process.env.TEST_OPT_VAR = 'set-value';
      const { optional } = await import('../src/config.js');
      expect(optional('TEST_OPT_VAR', 'fallback')).toBe('set-value');
    });

    it('returns fallback when not set', async () => {
      delete process.env.TEST_OPT_VAR_MISSING;
      const { optional } = await import('../src/config.js');
      expect(optional('TEST_OPT_VAR_MISSING', 'fallback')).toBe('fallback');
    });

    it('returns fallback when empty string', async () => {
      process.env.TEST_OPT_EMPTY = '';
      const { optional } = await import('../src/config.js');
      expect(optional('TEST_OPT_EMPTY', 'fb')).toBe('fb');
    });
  });

  describe('optionalInt()', () => {
    it('parses integer from env', async () => {
      process.env.TEST_INT = '42';
      const { optionalInt } = await import('../src/config.js');
      expect(optionalInt('TEST_INT', 0)).toBe(42);
    });

    it('returns fallback when not set', async () => {
      delete process.env.TEST_INT_MISSING;
      const { optionalInt } = await import('../src/config.js');
      expect(optionalInt('TEST_INT_MISSING', 7)).toBe(7);
    });

    it('returns fallback when value is not a valid integer', async () => {
      process.env.TEST_INT_BAD = 'not-a-number';
      const { optionalInt } = await import('../src/config.js');
      expect(optionalInt('TEST_INT_BAD', 99)).toBe(99);
    });
  });

  describe('optionalBool()', () => {
    it('parses true from "true"', async () => {
      process.env.TEST_BOOL = 'true';
      const { optionalBool } = await import('../src/config.js');
      expect(optionalBool('TEST_BOOL', false)).toBe(true);
    });

    it('parses true from "1"', async () => {
      process.env.TEST_BOOL = '1';
      const { optionalBool } = await import('../src/config.js');
      expect(optionalBool('TEST_BOOL', false)).toBe(true);
    });

    it('parses false from "false"', async () => {
      process.env.TEST_BOOL = 'false';
      const { optionalBool } = await import('../src/config.js');
      expect(optionalBool('TEST_BOOL', true)).toBe(false);
    });

    it('parses false from "0"', async () => {
      process.env.TEST_BOOL = '0';
      const { optionalBool } = await import('../src/config.js');
      expect(optionalBool('TEST_BOOL', true)).toBe(false);
    });

    it('returns fallback when not set', async () => {
      delete process.env.TEST_BOOL_MISSING;
      const { optionalBool } = await import('../src/config.js');
      expect(optionalBool('TEST_BOOL_MISSING', true)).toBe(true);
    });
  });

  describe('config object', () => {
    it('exposes expected sections', async () => {
      process.env.NODE_ENV = 'development';
      process.env.DATABASE_URL = 'postgres://test';
      process.env.JWT_SECRET = 'test-secret';
      process.env.VOXIMPLANT_ACCOUNT_ID = 'test';
      process.env.VOXIMPLANT_API_KEY_ID = 'test';
      process.env.VOXIMPLANT_APPLICATION_ID = 'test';
      process.env.VOXIMPLANT_APPLICATION_NAME = 'test';
      process.env.VOXIMPLANT_ACCOUNT_NAME = 'test';
      process.env.CRM_BASE_URL = 'http://test';
      process.env.CRM_API_KEY = 'test';
      const { config } = await import('../src/config.js');
      expect(config.server).toBeDefined();
      expect(config.database).toBeDefined();
      expect(config.redis).toBeDefined();
      expect(config.jwt).toBeDefined();
      expect(config.voximplant).toBeDefined();
      expect(config.crm).toBeDefined();
      expect(config.recording).toBeDefined();
      expect(config.frontend).toBeDefined();
      expect(config.logging).toBeDefined();
    });

    it('parses PORT as integer with default', async () => {
      process.env.NODE_ENV = 'development';
      process.env.PORT = '5000';
      process.env.DATABASE_URL = 'postgres://test';
      process.env.JWT_SECRET = 'test-secret';
      process.env.VOXIMPLANT_ACCOUNT_ID = 'test';
      process.env.VOXIMPLANT_API_KEY_ID = 'test';
      process.env.VOXIMPLANT_APPLICATION_ID = 'test';
      process.env.VOXIMPLANT_APPLICATION_NAME = 'test';
      process.env.VOXIMPLANT_ACCOUNT_NAME = 'test';
      process.env.CRM_BASE_URL = 'http://test';
      process.env.CRM_API_KEY = 'test';
      const { config } = await import('../src/config.js');
      expect(config.server.port).toBe(5000);
    });
  });
});
