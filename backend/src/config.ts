import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function required(key: string): string {
  const value = process.env[key];
  if (!value && process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || '';
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

function optionalInt(key: string, fallback: number): number {
  const val = process.env[key];
  return val ? parseInt(val, 10) : fallback;
}

function optionalBool(key: string, fallback: boolean): boolean {
  const val = process.env[key];
  if (!val) return fallback;
  return val === 'true' || val === '1';
}

export const config = {
  env: optional('NODE_ENV', 'development'),
  port: optionalInt('PORT', 5000),

  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: optional('JWT_EXPIRES_IN', '8h'),
  },

  database: {
    url: required('DATABASE_URL'),
  },

  voximplant: {
    accountId: optional('VOXIMPLANT_ACCOUNT_ID', ''),
    apiKeyId: optional('VOXIMPLANT_API_KEY_ID', ''),
    apiKeyPath: optional('VOXIMPLANT_API_KEY_PATH', './vox_ci_credentials.json'),
    applicationId: optional('VOXIMPLANT_APPLICATION_ID', ''),
    applicationName: optional('VOXIMPLANT_APPLICATION_NAME', ''),
    accountName: optional('VOXIMPLANT_ACCOUNT_NAME', ''),
    defaultCallerId: optional('VOXIMPLANT_DEFAULT_CALLER_ID', ''),
    sipDomain: optional('VOXIMPLANT_SIP_DOMAIN', ''),
  },

  ai: {
    openaiApiKey: optional('OPENAI_API_KEY', ''),
    openaiModel: optional('OPENAI_REALTIME_MODEL', 'gpt-4o-realtime-preview'),
    openaiVoice: optional('OPENAI_VOICE', 'alloy'),
  },

  frontend: {
    url: optional('FRONTEND_URL', 'http://localhost:3000'),
  },

  dialer: {
    mode: optional('DIALER_MODE', 'preview') as 'manual' | 'preview' | 'progressive' | 'predictive' | 'ai',
    pollIntervalMs: optionalInt('DIALER_POLL_INTERVAL_MS', 3000),
    maxAbandonRate: parseFloat(optional('MAX_ABANDON_RATE', '0.03')),
    defaultMaxAttemptsPerLead: optionalInt('DEFAULT_MAX_ATTEMPTS_PER_LEAD', 3),
    defaultRetryDelaySeconds: optionalInt('DEFAULT_RETRY_DELAY_SECONDS', 3600),
  },

  amd: {
    enabled: optionalBool('AMD_ENABLED', true),
    initialSilenceMs: optionalInt('AMD_INITIAL_SILENCE_MS', 4500),
    greetingMs: optionalInt('AMD_GREETING_MS', 1500),
    afterGreetingMs: optionalInt('AMD_AFTER_GREETING_MS', 800),
  },

  compliance: {
    tcpaWindowStartHour: optionalInt('TCPA_WINDOW_START_HOUR', 8),
    tcpaWindowEndHour: optionalInt('TCPA_WINDOW_END_HOUR', 21),
    tcpaDefaultTimezone: optional('TCPA_DEFAULT_TIMEZONE', 'America/Chicago'),
    regfMaxCallsPerDebt: optionalInt('REGF_MAX_CALLS_PER_DEBT', 7),
    regfWindowDays: optionalInt('REGF_WINDOW_DAYS', 7),
  },

  webhookSecret: optional('VOXIMPLANT_WEBHOOK_SECRET', ''),

  crm: {
    baseUrl: optional('CRM_BASE_URL', ''),
    apiKey: optional('CRM_API_KEY', ''),
    webhookUrl: optional('CRM_WEBHOOK_URL', ''),
    webhookSecret: optional('CRM_WEBHOOK_SECRET', ''),
  },

  recording: {
    storageUrl: optional('RECORDING_STORAGE_URL', ''),
    transcriptUrl: optional('TRANSCRIPT_STORAGE_URL', ''),
  },
} as const;
