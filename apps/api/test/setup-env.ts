Object.assign(process.env, {
  NODE_ENV: 'test',
  PORT: '3000',
  APP_ORIGINS:
    'http://localhost:5173,http://localhost:5174,http://localhost:5175',
  DATABASE_URL:
    'postgresql://overtime_test:overtime_test@127.0.0.1:55432/overtime_test',
  DATABASE_MIGRATION_URL:
    'postgresql://overtime_test:overtime_test@127.0.0.1:55432/overtime_test',
  GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
  GOOGLE_HOSTED_DOMAIN: 'company.com',
  ADMIN_EMAILS: 'admin@company.com',
  SESSION_COOKIE_NAME: 'overtime_session',
  SESSION_TTL_DAYS: '7',
  SESSION_HASH_SECRET: '12345678901234567890123456789012',
});
