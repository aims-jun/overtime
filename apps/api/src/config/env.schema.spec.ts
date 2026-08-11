import { parseEnv } from './env.schema';

const validEnv: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
  PORT: '3000',
  APP_ORIGINS:
    'http://localhost:5173, http://localhost:5174,http://localhost:5175',
  DATABASE_URL: 'postgresql://overtime_app:test@127.0.0.1:55432/overtime_test',
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

    expect(env.APP_ORIGINS).toEqual([
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
    ]);
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

  it.each(['./data/overtime.sqlite', 'mysql://user:pass@localhost/db'])(
    'rejects a non-PostgreSQL DATABASE_URL: %s',
    (DATABASE_URL) => {
      expect(() => parseEnv({ ...validEnv, DATABASE_URL })).toThrow();
    },
  );

  it('requires an HTTPS origin in production', () => {
    expect(() =>
      parseEnv({
        ...validEnv,
        NODE_ENV: 'production',
        APP_ORIGINS: 'https://overtime.company.com,http://localhost:5175',
      }),
    ).toThrow();
  });

  it('defaults REPORT_DEPARTMENT to IT개발팀', () => {
    expect(parseEnv(validEnv).REPORT_DEPARTMENT).toBe('IT개발팀');
  });

  it('uses the provided REPORT_DEPARTMENT', () => {
    expect(
      parseEnv({ ...validEnv, REPORT_DEPARTMENT: '플랫폼팀' })
        .REPORT_DEPARTMENT,
    ).toBe('플랫폼팀');
  });
});
