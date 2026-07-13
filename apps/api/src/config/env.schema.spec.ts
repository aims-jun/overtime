import { parseEnv } from './env.schema';

const validEnv: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
  PORT: '3000',
  APP_ORIGIN: 'http://localhost:5173',
  DATABASE_PATH: './data/overtime.sqlite',
  GOOGLE_CLIENT_ID: 'client.apps.googleusercontent.com',
  GOOGLE_HOSTED_DOMAIN: 'Company.COM',
  ADMIN_EMAILS: 'Admin@Company.com, second@company.com',
  SESSION_COOKIE_NAME: 'overtime_session',
  SESSION_TTL_DAYS: '7',
  SESSION_HASH_SECRET: '12345678901234567890123456789012',
};

describe('parseEnv', () => {
  it('normalizes domain and administrator emails', () => {
    const env = parseEnv(validEnv);

    expect(env.GOOGLE_HOSTED_DOMAIN).toBe('company.com');
    expect(env.ADMIN_EMAILS).toEqual([
      'admin@company.com',
      'second@company.com',
    ]);
  });

  it('rejects a short session hash secret', () => {
    expect(() =>
      parseEnv({ ...validEnv, SESSION_HASH_SECRET: 'short' }),
    ).toThrow();
  });

  it('requires an HTTPS origin in production', () => {
    expect(() =>
      parseEnv({
        ...validEnv,
        NODE_ENV: 'production',
        APP_ORIGIN: 'http://overtime.company.com',
      }),
    ).toThrow();
  });
});
