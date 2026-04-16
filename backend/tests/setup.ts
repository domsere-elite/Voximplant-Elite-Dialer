// Global test setup: set required env vars before any module is loaded.
// This runs before each test file's module graph is resolved.
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
process.env.VOXIMPLANT_ACCOUNT_ID = process.env.VOXIMPLANT_ACCOUNT_ID ?? 'test';
process.env.VOXIMPLANT_API_KEY_ID = process.env.VOXIMPLANT_API_KEY_ID ?? 'test';
process.env.VOXIMPLANT_APPLICATION_ID = process.env.VOXIMPLANT_APPLICATION_ID ?? 'test';
process.env.VOXIMPLANT_APPLICATION_NAME = process.env.VOXIMPLANT_APPLICATION_NAME ?? 'test';
process.env.VOXIMPLANT_ACCOUNT_NAME = process.env.VOXIMPLANT_ACCOUNT_NAME ?? 'test';
process.env.CRM_BASE_URL = process.env.CRM_BASE_URL ?? 'http://test';
process.env.CRM_API_KEY = process.env.CRM_API_KEY ?? 'test';
process.env.VOXIMPLANT_WEBHOOK_SECRET = process.env.VOXIMPLANT_WEBHOOK_SECRET ?? 'test-webhook-secret';
