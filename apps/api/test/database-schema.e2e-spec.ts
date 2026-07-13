import { DataSource } from 'typeorm';
import { createTypeOrmOptions } from '../src/database/typeorm.config';

function readNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error('SQLite schema query did not return an array');
  }

  const rows: unknown[] = value;
  return rows.map((row) => {
    if (
      typeof row !== 'object' ||
      row === null ||
      !('name' in row) ||
      typeof row.name !== 'string'
    ) {
      throw new Error('SQLite schema row did not contain a name');
    }
    return row.name;
  });
}

describe('database schema', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource(createTypeOrmOptions(':memory:'));
    await dataSource.initialize();
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('creates users, sessions, and overtime records with required indexes', async () => {
    const tables: unknown = await dataSource.query(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    );
    const indexes: unknown = await dataSource.query(
      "SELECT name FROM sqlite_master WHERE type = 'index'",
    );

    expect(readNames(tables)).toEqual(
      expect.arrayContaining(['users', 'sessions', 'overtime_records']),
    );
    expect(readNames(indexes)).toEqual(
      expect.arrayContaining([
        'idx_users_google_subject',
        'idx_sessions_token_hash',
        'idx_sessions_expires_at',
        'idx_overtime_user_work_date',
      ]),
    );
  });
});
