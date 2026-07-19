import { z } from 'zod';

export type Env = {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  APP_ORIGINS: string[];
  DATABASE_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_HOSTED_DOMAIN: string;
  ADMIN_EMAILS: string[];
  SESSION_COOKIE_NAME: string;
  SESSION_TTL_DAYS: number;
  SESSION_HASH_SECRET: string;
};

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    APP_ORIGINS: z
      .string()
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.url()).min(1)),
    DATABASE_URL: z
      .string()
      .url()
      .refine(
        (value) =>
          ['postgres:', 'postgresql:'].includes(new URL(value).protocol),
        'PostgreSQL URL이어야 합니다.',
      ),
    GOOGLE_CLIENT_ID: z.string().trim().min(1),
    GOOGLE_HOSTED_DOMAIN: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/),
    ADMIN_EMAILS: z
      .string()
      .transform((value) =>
        value
          .split(',')
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean),
      )
      .pipe(z.array(z.email()).min(1)),
    SESSION_COOKIE_NAME: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]+$/),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    SESSION_HASH_SECRET: z.string().min(32),
  })
  .superRefine((env, context) => {
    if (
      env.NODE_ENV === 'production' &&
      env.APP_ORIGINS.some((origin) => !origin.startsWith('https://'))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['APP_ORIGINS'],
        message: '운영 환경의 APP_ORIGINS는 모두 HTTPS 주소여야 합니다.',
      });
    }
  });

export function parseEnv(input: NodeJS.ProcessEnv): Env {
  return envSchema.parse(input);
}
