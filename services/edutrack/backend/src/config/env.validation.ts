import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MinLength,
  Min,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

const toBoolean = ({ value }: { value: unknown }) => value === true || value === 'true';
const toNumber = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : Number(value);
const toOptionalString = ({ value }: { value: unknown }) => (value === '' ? undefined : value);

/**
 * Development-only signing secret. Production refuses to boot with it (see `validateEnv`), so a
 * forgotten variable can never sign real tokens.
 */
export const DEV_JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me-in-every-deployed-env';

export class Env {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean)
      : value,
  )
  @IsString({ each: true })
  CORS_ORIGINS: string[] = [];

  /**
   * Express `trust proxy`: which hops may set X-Forwarded-For. `loopback` locally; the load
   * balancer's range (or hop count) when deployed. Rate limits and session IPs depend on it.
   */
  @IsString()
  TRUST_PROXY = 'loopback';

  /** JSON log lines (one object per line). Defaults to on in production. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  LOG_JSON?: boolean;

  @IsUrl({ protocols: ['postgresql', 'postgres'], require_tld: false })
  DATABASE_URL: string;

  @IsUrl({ protocols: ['redis', 'rediss'], require_tld: false })
  REDIS_URL: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  S3_ENDPOINT?: string;

  @IsString()
  S3_REGION: string;

  @IsString()
  S3_BUCKET: string;

  @IsString()
  S3_ACCESS_KEY_ID: string;

  @IsString()
  S3_SECRET_ACCESS_KEY: string;

  @Transform(toBoolean)
  @IsBoolean()
  S3_FORCE_PATH_STYLE = false;

  @Transform(toBoolean)
  @IsBoolean()
  S3_CREATE_BUCKET = false;

  /* ---------- Tenancy ---------- */

  /**
   * School portals live on `<slug>.<APP_BASE_DOMAIN>` (greenfield.edutrack.ng). Locally
   * `localhost`, so greenfield.localhost works in the browser without DNS changes.
   */
  @IsString()
  APP_BASE_DOMAIN = 'localhost';

  /* ---------- Auth ---------- */

  /** HMAC secret for access tokens (HS256). At least 32 characters; never the dev default in production. */
  @IsString()
  @MinLength(32)
  JWT_SECRET = DEV_JWT_SECRET;

  @Transform(toNumber)
  @IsInt()
  @Min(60)
  @Max(3600)
  JWT_ACCESS_TTL_SECONDS = 900;

  /** "Keep me signed in": refresh cookie and session lifetime. */
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(90)
  REFRESH_TTL_REMEMBER_DAYS = 30;

  /** Without "keep me signed in": a browser-session cookie, and the server ends the session after this. */
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(48)
  REFRESH_TTL_SESSION_HOURS = 12;

  /**
   * Two tabs refreshing with the same cookie at once is not theft: a just-rotated token presented
   * again within this window gets a retryable 409 instead of revoking the session.
   */
  @Transform(toNumber)
  @IsInt()
  @Min(0)
  @Max(60)
  REFRESH_REUSE_GRACE_SECONDS = 10;

  /** Secure attribute on the refresh cookie. Defaults to on everywhere except development and test. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  COOKIE_SECURE?: boolean;

  /** Domain attribute on the refresh cookie. Leave empty for host-only cookies (recommended). */
  @IsOptional()
  @Transform(toOptionalString)
  @IsString()
  COOKIE_DOMAIN?: string;

  @Transform(toNumber)
  @IsInt()
  @Min(5)
  @Max(24 * 60)
  PASSWORD_RESET_TTL_MINUTES = 60;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(30)
  INVITATION_TTL_DAYS = 7;

  /** Lockout for platform staff (schools set their own in Settings → Security). */
  @Transform(toNumber)
  @IsInt()
  @Min(3)
  @Max(20)
  PLATFORM_LOCKOUT_ATTEMPTS = 5;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  PLATFORM_LOCKOUT_MINUTES = 15;

  /* ---------- Links in emails ---------- */

  @IsUrl({ require_tld: false })
  PLATFORM_PORTAL_URL = 'http://localhost:5170';

  @IsUrl({ require_tld: false })
  SCHOOL_ADMIN_PORTAL_URL = 'http://localhost:5171';

  /** Teacher Workspace base URL; `{slug}` is replaced with the school's slug. */
  @IsString()
  TEACHER_PORTAL_URL_TEMPLATE = 'http://localhost:5172';

  /* ---------- Mail and SMS ---------- */

  @IsString()
  SMTP_HOST = 'localhost';

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(65535)
  SMTP_PORT = 1025;

  /** Implicit TLS (port 465). STARTTLS is negotiated automatically when the server offers it. */
  @Transform(toBoolean)
  @IsBoolean()
  SMTP_SECURE = false;

  @IsOptional()
  @Transform(toOptionalString)
  @IsString()
  SMTP_USER?: string;

  @IsOptional()
  @Transform(toOptionalString)
  @IsString()
  SMTP_PASSWORD?: string;

  @IsString()
  MAIL_FROM = 'EduTrack <no-reply@edutrack.ng>';

  @IsOptional()
  @IsEmail()
  MAIL_REPLY_TO?: string;

  /** `log` writes messages to the API log (development). Termii comes later. */
  @IsIn(['log'])
  SMS_DRIVER = 'log' as const;

  @IsString()
  SMS_SENDER_ID = 'EduTrack';
}

/** Settings that are safe locally but must be set explicitly in a deployed environment. */
function productionProblems(env: Env): string[] {
  if (env.NODE_ENV !== NodeEnv.Production) return [];
  const problems: string[] = [];
  if (env.JWT_SECRET === DEV_JWT_SECRET)
    problems.push('JWT_SECRET: still the development default; set a random 32+ character secret');
  if (env.COOKIE_SECURE === false)
    problems.push('COOKIE_SECURE: must not be false in production (refresh cookies need HTTPS)');
  if (env.APP_BASE_DOMAIN === 'localhost')
    problems.push('APP_BASE_DOMAIN: set the real base domain (e.g. edutrack.ng)');
  for (const key of ['PLATFORM_PORTAL_URL', 'SCHOOL_ADMIN_PORTAL_URL'] as const)
    if (/localhost|127\.0\.0\.1/.test(env[key]))
      problems.push(`${key}: points at localhost; emails would carry unusable links`);
  return problems;
}

/** Fails fast on boot when the environment is incomplete, malformed or unsafe for production. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const env = plainToInstance(Env, raw, { exposeDefaultValues: true });
  const errors = validateSync(env, { skipMissingProperties: false });
  const details = errors.map(
    (error) => `  - ${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`,
  );
  if (errors.length === 0) details.push(...productionProblems(env).map((p) => `  - ${p}`));
  if (details.length > 0)
    throw new Error(`Invalid environment configuration:\n${details.join('\n')}`);
  env.COOKIE_SECURE ??= env.NODE_ENV === NodeEnv.Production;
  env.LOG_JSON ??= env.NODE_ENV === NodeEnv.Production;
  return env;
}
