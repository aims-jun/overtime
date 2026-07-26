import type { DataSource } from 'typeorm';
import { readPostgresMigrationRows, readSqliteMigrationRows } from './migrate';
import {
  assertDurationAggregatesMatch,
  assertForeignKeysValid,
  assertMigrationVerified,
  createMigrationSnapshot,
} from './verify';
import type { MigrationSnapshot } from './verify';

const EXPECTED_MIGRATIONS = [
  'InitialSchema1752360000000',
  'AddOvertimeOverlapConstraint1753500000000',
] as const;

export type PostMigrationVerificationReport = {
  source: MigrationSnapshot;
  target: MigrationSnapshot;
  sessions: number;
  orphans: number;
  migrations: string[];
};

type PostMigrationVerificationInput = {
  sqlitePath: string;
  target: DataSource;
};

export async function verifySqliteToPostgresAfterCommit({
  sqlitePath,
  target,
}: PostMigrationVerificationInput): Promise<PostMigrationVerificationReport> {
  const sourceRows = readSqliteMigrationRows(sqlitePath);
  const targetRows = await readPostgresMigrationRows(target.manager);
  const source = createMigrationSnapshot(sourceRows);
  const targetSnapshot = createMigrationSnapshot(targetRows);

  assertForeignKeysValid(sourceRows);
  assertForeignKeysValid(targetRows);
  assertMigrationVerified(source, targetSnapshot);
  assertDurationAggregatesMatch(
    sourceRows.overtimeRecords,
    targetRows.overtimeRecords,
  );

  const [{ sessions, orphans }, migrationRows] = await Promise.all([
    readIntegrityCounts(target),
    target.query<Array<{ name: string }>>(
      'SELECT name FROM migrations ORDER BY id',
    ),
  ]);
  if (sessions !== 0) throw new Error('verification mismatch: sessions');
  if (orphans !== 0) throw new Error('verification mismatch: foreign keys');

  const migrations = migrationRows.map(({ name }) => name);
  if (
    migrations.length !== EXPECTED_MIGRATIONS.length ||
    migrations.some((name, index) => name !== EXPECTED_MIGRATIONS[index])
  ) {
    throw new Error('verification mismatch: migration version');
  }

  return {
    source,
    target: targetSnapshot,
    sessions,
    orphans,
    migrations,
  };
}

async function readIntegrityCounts(
  target: DataSource,
): Promise<{ sessions: number; orphans: number }> {
  const [row] = await target.query<
    Array<{ sessions: string; orphans: string }>
  >(`
    SELECT
      (SELECT COUNT(*) FROM sessions)::text AS sessions,
      (
        SELECT COUNT(*)
        FROM overtime_records records
        LEFT JOIN users ON users.id = records.user_id
        WHERE users.id IS NULL
      )::text AS orphans
  `);
  if (!row) throw new Error('verification mismatch: counts');
  return { sessions: Number(row.sessions), orphans: Number(row.orphans) };
}
