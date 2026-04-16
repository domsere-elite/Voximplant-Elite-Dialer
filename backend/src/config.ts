import 'dotenv/config';

/**
 * Configuration helpers for environment variable loading.
 *
 * In production, `required()` throws on missing vars. In development/test,
 * it warns and returns an empty string so local dev doesn't explode.
 */

const isProduction = (): boolean => process.env.NODE_ENV === 'production';

export function required(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === null || value === '') {
    if (isProduction()) {
      throw new Error(
        `Missing required environment variable: ${key} (NODE_ENV=production)`,
      );
    }
    // eslint-disable-next-line no-console
    console.warn(
      `[config] Missing required env var ${key} — returning empty string (NODE_ENV=${process.env.NODE_ENV ?? 'unset'})`,
    );
    return '';
  }
  return value;
}

export function optional(key: string, fallback: string): string {
  const value = process.env[key];
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return value;
}

export function optionalInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === null || raw === '') {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    // eslint-disable-next-line no-console
    console.warn(
      `[config] Could not parse integer for ${key}="${raw}" — using fallback ${fallback}`,
    );
    return fallback;
  }
  return parsed;
}

export function optionalBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw === null || raw === '') {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  // eslint-disable-next-line no-console
  console.warn(
    `[config] Could not parse boolean for ${key}="${raw}" — using fallback ${fallback}`,
  );
  return fallback;
}

function createConfig() {
  return {
    server: {
      nodeEnv: optional('NODE_ENV', 'development'),
      port: optionalInt('PORT', 5000),
      isProduction: isProduction(),
    },
    database: {
      url: required('DATABASE_URL'),
    },
    redis: {
      url: optional('REDIS_URL', 'redis://localhost:6379'),
    },
    jwt: {
      secret: required('JWT_SECRET'),
      expiresIn: optional('JWT_EXPIRES_IN', '8h'),
    },
    voximplant: {
      accountId: required('VOXIMPLANT_ACCOUNT_ID'),
      apiKeyId: required('VOXIMPLANT_API_KEY_ID'),
      apiKeyPath: optional('VOXIMPLANT_API_KEY_PATH', './vox_credentials.json'),
      applicationId: required('VOXIMPLANT_APPLICATION_ID'),
      applicationName: required('VOXIMPLANT_APPLICATION_NAME'),
      accountName: required('VOXIMPLANT_ACCOUNT_NAME'),
    },
    webhook: {
      secret: required('VOXIMPLANT_WEBHOOK_SECRET'),
    },
    crm: {
      baseUrl: required('CRM_BASE_URL'),
      apiKey: required('CRM_API_KEY'),
    },
    recording: {
      s3Bucket: optional('RECORDING_S3_BUCKET', ''),
      s3Region: optional('RECORDING_S3_REGION', ''),
      s3AccessKey: optional('RECORDING_S3_ACCESS_KEY', ''),
      s3SecretKey: optional('RECORDING_S3_SECRET_KEY', ''),
    },
    frontend: {
      url: optional('FRONTEND_URL', 'http://localhost:3000'),
      dialerApiUrl: optional('NEXT_PUBLIC_DIALER_API_URL', 'http://localhost:5000'),
      crmUrl: optional('NEXT_PUBLIC_CRM_URL', ''),
    },
    logging: {
      level: optional('LOG_LEVEL', 'info'),
    },
  } as const;
}

let cachedConfig: ReturnType<typeof createConfig> | null = null;

function getConfig() {
  if (!cachedConfig) {
    cachedConfig = createConfig();
  }
  return cachedConfig;
}

/** Clears the cached config — for use in tests only. */
export function resetConfig(): void {
  cachedConfig = null;
}

export const config = new Proxy({} as ReturnType<typeof createConfig>, {
  get(_target, prop) {
    return getConfig()[prop as keyof ReturnType<typeof createConfig>];
  },
});

export type AppConfig = ReturnType<typeof createConfig>;
