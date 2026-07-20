import {
  parseDatabaseMigrationEnv,
  parseMigrationEnv,
} from './migration-env.schema';

const validMigrationEnv = {
  DATABASE_MIGRATION_URL:
    'postgresql://overtime_migrator:test@postgres:5432/overtime',
  SQLITE_SOURCE_PATH: '/migration-source/overtime-cutover.sqlite',
};

describe('parseMigrationEnv', () => {
  it('accepts a database-only environment for schema migrations', () => {
    expect(
      parseDatabaseMigrationEnv({
        DATABASE_MIGRATION_URL: validMigrationEnv.DATABASE_MIGRATION_URL,
      }),
    ).toEqual({
      DATABASE_MIGRATION_URL: validMigrationEnv.DATABASE_MIGRATION_URL,
    });
  });

  it('preserves valid migration inputs', () => {
    expect(parseMigrationEnv(validMigrationEnv)).toEqual({
      DATABASE_MIGRATION_URL:
        'postgresql://overtime_migrator:test@postgres:5432/overtime',
      SQLITE_SOURCE_PATH: '/migration-source/overtime-cutover.sqlite',
    });
  });

  it('rejects a missing migration URL', () => {
    expect(() =>
      parseMigrationEnv({
        SQLITE_SOURCE_PATH: validMigrationEnv.SQLITE_SOURCE_PATH,
      }),
    ).toThrow();
  });

  it('rejects a missing SQLite source path', () => {
    expect(() =>
      parseMigrationEnv({
        DATABASE_MIGRATION_URL: validMigrationEnv.DATABASE_MIGRATION_URL,
      }),
    ).toThrow();
  });
});
