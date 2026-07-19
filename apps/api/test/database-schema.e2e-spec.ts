import { DataSource } from 'typeorm';
import { createTypeOrmOptions } from '../src/database/typeorm.config';

type NamedRow = Record<string, string>;
type ConstraintRow = {
  conname: string;
  contype: string;
  definition: string;
};

function readColumn(rows: unknown, column: string): string[] {
  if (!Array.isArray(rows)) {
    throw new Error('PostgreSQL catalog query did not return rows');
  }

  return rows.map((row: unknown) => {
    if (
      typeof row !== 'object' ||
      row === null ||
      !(column in row) ||
      typeof (row as NamedRow)[column] !== 'string'
    ) {
      throw new Error(`PostgreSQL catalog row did not contain ${column}`);
    }
    return (row as NamedRow)[column];
  });
}

function readConstraints(rows: unknown): Map<string, ConstraintRow> {
  if (!Array.isArray(rows)) {
    throw new Error('PostgreSQL constraint query did not return rows');
  }

  return new Map(
    rows.map((row: unknown) => {
      if (
        typeof row !== 'object' ||
        row === null ||
        !('conname' in row) ||
        typeof row.conname !== 'string' ||
        !('contype' in row) ||
        typeof row.contype !== 'string' ||
        !('definition' in row) ||
        typeof row.definition !== 'string'
      ) {
        throw new Error('PostgreSQL constraint row had an invalid shape');
      }

      const constraint: ConstraintRow = {
        conname: row.conname,
        contype: row.contype,
        definition: row.definition,
      };
      return [constraint.conname, constraint];
    }),
  );
}

describe('database schema', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource(
      createTypeOrmOptions(process.env.DATABASE_URL as string),
    );
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('creates users, sessions, and overtime records with required indexes', async () => {
    const tables: unknown = await dataSource.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    const indexes: unknown = await dataSource.query(
      "SELECT indexname FROM pg_indexes WHERE schemaname = 'public'",
    );

    expect(readColumn(tables, 'table_name')).toEqual(
      expect.arrayContaining(['users', 'sessions', 'overtime_records']),
    );
    expect(readColumn(indexes, 'indexname')).toEqual(
      expect.arrayContaining([
        'idx_users_google_subject',
        'idx_sessions_token_hash',
        'idx_sessions_expires_at',
        'idx_overtime_user_work_date',
      ]),
    );
  });

  it('uses native PostgreSQL column types', async () => {
    const columns: unknown = await dataSource.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('users', 'sessions', 'overtime_records')
    `);

    expect(columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table_name: 'users',
          column_name: 'id',
          data_type: 'uuid',
        }),
        expect.objectContaining({
          table_name: 'sessions',
          column_name: 'expires_at',
          data_type: 'timestamp with time zone',
        }),
        expect.objectContaining({
          table_name: 'overtime_records',
          column_name: 'work_date',
          data_type: 'date',
        }),
        expect.objectContaining({
          table_name: 'overtime_records',
          column_name: 'duration_minutes',
          data_type: 'integer',
        }),
      ]),
    );
  });

  it('creates the required foreign-key and check constraints', async () => {
    const constraints: unknown = await dataSource.query(`
      SELECT conname, contype, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
    `);

    const byName = readConstraints(constraints);
    expect(byName.get('fk_sessions_user')?.contype).toBe('f');
    expect(byName.get('fk_sessions_user')?.definition).toContain(
      'ON DELETE CASCADE',
    );
    expect(byName.get('fk_overtime_user')?.contype).toBe('f');
    expect(byName.get('fk_overtime_user')?.definition).toContain(
      'ON DELETE RESTRICT',
    );
    expect(byName.get('chk_overtime_duration_positive')?.contype).toBe('c');
    expect(byName.get('chk_overtime_duration_positive')?.definition).toContain(
      'duration_minutes > 0',
    );
    expect(byName.get('chk_overtime_time_order')?.contype).toBe('c');
    expect(byName.get('chk_overtime_time_order')?.definition).toContain(
      'end_at > start_at',
    );
  });
});
