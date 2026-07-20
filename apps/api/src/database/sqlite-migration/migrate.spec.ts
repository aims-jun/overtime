import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { createMigrationDataSource } from '../migration-data-source';
import { SessionEntity } from '../entities/session.entity';
import { UserEntity } from '../entities/user.entity';
import { migrateSqliteToPostgres } from './migrate';

const DATABASE_URL =
  process.env.DATABASE_MIGRATION_URL ??
  'postgresql://overtime_test:overtime_test@127.0.0.1:55432/overtime_test';

const USERS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    googleSubject: 'subject-one',
    email: 'one@example.com',
    name: '김하나',
    profileImageUrl: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    lastLoginAt: '2026-07-02T01:00:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    googleSubject: 'subject-two',
    email: 'two@example.com',
    name: '이두나',
    profileImageUrl: 'https://example.com/two.png',
    createdAt: '2026-07-01T00:00:00.000Z',
    lastLoginAt: '2026-07-03T01:00:00.000Z',
  },
];

const RECORDS = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    userId: USERS[0].id,
    workDate: '2026-07-10',
    startAt: '2026-07-10T09:00:00.000Z',
    endAt: '2026-07-10T10:00:00.000Z',
    durationMinutes: 60,
    reason: '한글 사유 🌟',
    createdAt: '2026-07-10T10:00:00.000Z',
    updatedAt: '2026-07-10T10:00:00.000Z',
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    userId: USERS[0].id,
    workDate: '2026-07-10',
    startAt: '2026-07-10T11:00:00.000Z',
    endAt: '2026-07-10T11:30:00.000Z',
    durationMinutes: 30,
    reason: 'Second task',
    createdAt: '2026-07-10T11:30:00.000Z',
    updatedAt: '2026-07-10T11:30:00.000Z',
  },
  {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    userId: USERS[1].id,
    workDate: '2026-07-11',
    startAt: '2026-07-11T12:00:00.000Z',
    endAt: '2026-07-11T14:00:00.000Z',
    durationMinutes: 120,
    reason: 'Third task',
    createdAt: '2026-07-11T14:00:00.000Z',
    updatedAt: '2026-07-11T14:00:00.000Z',
  },
];

function createSqliteFixture(mutate?: (database: Database.Database) => void): {
  directory: string;
  path: string;
} {
  const directory = mkdtempSync(join(tmpdir(), 'sqlite-migration-'));
  const path = join(directory, 'source.sqlite');
  const database = new Database(path);
  database.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      googleSubject TEXT NOT NULL,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      profileImageUrl TEXT,
      createdAt TEXT NOT NULL,
      lastLoginAt TEXT NOT NULL
    );
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      tokenHash TEXT NOT NULL,
      userId TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE overtime_records (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      workDate TEXT NOT NULL,
      startAt TEXT NOT NULL,
      endAt TEXT NOT NULL,
      durationMinutes INTEGER NOT NULL,
      reason TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);
  const insertUser = database.prepare(`
    INSERT INTO users
      (id, googleSubject, email, name, profileImageUrl, createdAt, lastLoginAt)
    VALUES
      (@id, @googleSubject, @email, @name, @profileImageUrl, @createdAt, @lastLoginAt)
  `);
  const insertRecord = database.prepare(`
    INSERT INTO overtime_records
      (id, userId, workDate, startAt, endAt, durationMinutes, reason, createdAt, updatedAt)
    VALUES
      (@id, @userId, @workDate, @startAt, @endAt, @durationMinutes, @reason, @createdAt, @updatedAt)
  `);
  for (const user of USERS) insertUser.run(user);
  for (const record of RECORDS) insertRecord.run(record);
  database
    .prepare(
      `INSERT INTO sessions (id, tokenHash, userId, expiresAt, createdAt)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'private-token-hash',
      USERS[0].id,
      '2026-08-01T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z',
    );
  mutate?.(database);
  database.close();
  return { directory, path };
}

describe('migrateSqliteToPostgres', () => {
  let target: DataSource;
  const fixtureDirectories: string[] = [];

  beforeAll(async () => {
    target = createMigrationDataSource(DATABASE_URL);
    await target.initialize();
    await target.runMigrations();
  });

  beforeEach(async () => {
    await target.query(
      'DROP TRIGGER IF EXISTS migration_test_trigger ON overtime_records',
    );
    await target.query('DROP FUNCTION IF EXISTS migration_test_mutation()');
    await target.query(
      'TRUNCATE TABLE sessions, overtime_records, users CASCADE',
    );
  });

  afterAll(async () => {
    for (const directory of fixtureDirectories) {
      rmSync(directory, { recursive: true, force: true });
    }
    if (target.isInitialized) await target.destroy();
  });

  function fixture(mutate?: (database: Database.Database) => void): string {
    const created = createSqliteFixture(mutate);
    fixtureDirectories.push(created.directory);
    return created.path;
  }

  it('migrates users then records and excludes source sessions', async () => {
    const report = await migrateSqliteToPostgres({
      sqlitePath: fixture(),
      target,
    });

    expect(report.source).toEqual({ users: 2, overtimeRecords: 3 });
    expect(report.target).toEqual(report.source);
    expect(report.sourceHashes).toEqual(report.targetHashes);
    expect(Object.keys(report.sourceHashes).sort()).toEqual([
      'businessFields',
      'durationAggregates',
      'overtimeRecordIds',
      'userIds',
    ]);
    expect(await target.getRepository(SessionEntity).count()).toBe(0);
  });

  it('rejects a non-empty target', async () => {
    await target.getRepository(UserEntity).insert({
      ...USERS[0],
      createdAt: new Date(USERS[0].createdAt),
      lastLoginAt: new Date(USERS[0].lastLoginAt),
    });

    await expect(
      migrateSqliteToPostgres({ sqlitePath: fixture(), target }),
    ).rejects.toThrow('target is not empty');
  });

  it('checks target emptiness before opening the source', async () => {
    await target.getRepository(UserEntity).insert({
      ...USERS[0],
      createdAt: new Date(USERS[0].createdAt),
      lastLoginAt: new Date(USERS[0].lastLoginAt),
    });

    await expect(
      migrateSqliteToPostgres({
        sqlitePath: join(tmpdir(), 'source-that-does-not-exist.sqlite'),
        target,
      }),
    ).rejects.toThrow('target is not empty');
  });

  it('rejects a duplicate run instead of overwriting rows', async () => {
    const sqlitePath = fixture();
    await migrateSqliteToPostgres({ sqlitePath, target });

    await expect(
      migrateSqliteToPostgres({ sqlitePath, target }),
    ).rejects.toThrow('target is not empty');
    expect(await target.getRepository(UserEntity).count()).toBe(2);
  });

  it('aborts invalid source data before inserting target rows', async () => {
    const sqlitePath = fixture((database) => {
      database
        .prepare('UPDATE overtime_records SET startAt = ? WHERE id = ?')
        .run('private-invalid-date', RECORDS[0].id);
    });

    await expect(
      migrateSqliteToPostgres({ sqlitePath, target }),
    ).rejects.toThrow(
      `invalid timestamp at overtime_records row ${RECORDS[0].id}`,
    );
    expect(await target.getRepository(UserEntity).count()).toBe(0);
  });

  it.each([
    ['ID set', "NEW.id := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';"],
    ['normalized business fields', "NEW.reason := 'mutated';"],
    [
      'duration aggregates',
      'NEW.duration_minutes := NEW.duration_minutes + 1;',
    ],
    ['foreign keys', `NEW.user_id := '${USERS[1].id}';`],
  ])('rolls back when %s verification mismatches', async (_kind, mutation) => {
    await target.query(`
      CREATE FUNCTION migration_test_mutation() RETURNS trigger AS $$
      BEGIN
        IF NEW.id = '${RECORDS[0].id}' THEN
          ${mutation}
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await target.query(`
      CREATE TRIGGER migration_test_trigger
      BEFORE INSERT ON overtime_records
      FOR EACH ROW EXECUTE FUNCTION migration_test_mutation();
    `);

    await expect(
      migrateSqliteToPostgres({ sqlitePath: fixture(), target }),
    ).rejects.toThrow(/verification mismatch/);
    expect(await target.getRepository(UserEntity).count()).toBe(0);
    expect(
      await target.query('SELECT count(*)::int AS count FROM overtime_records'),
    ).toEqual([{ count: 0 }]);
  });
});
