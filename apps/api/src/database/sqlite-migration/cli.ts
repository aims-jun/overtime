import { parseMigrationEnv } from '../../config/migration-env.schema';
import { createMigrationDataSource } from '../migration-data-source';
import { migrateSqliteToPostgres } from './migrate';
import type { MigrationReport } from './types';

export async function runSqliteMigrationCli(): Promise<void> {
  const { DATABASE_MIGRATION_URL, SQLITE_SOURCE_PATH } = parseMigrationEnv(
    process.env,
  );
  const target = createMigrationDataSource(DATABASE_MIGRATION_URL);
  await target.initialize();

  try {
    await target.runMigrations();
    const report = await migrateSqliteToPostgres({
      sqlitePath: SQLITE_SOURCE_PATH,
      target,
    });
    console.log(formatMigrationSummary(report));
  } finally {
    await target.destroy();
  }
}

export function formatMigrationSummary(report: MigrationReport): string {
  return JSON.stringify({
    users: report.target.users,
    overtimeRecords: report.target.overtimeRecords,
    sessionsMigrated: 0,
    verification: 'passed',
  });
}

export function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'migration failed';
  if (
    /^(invalid UUID|invalid timestamp|invalid work date) at (users|overtime_records) row [0-9a-z-]+$/i.test(
      error.message,
    ) ||
    error.message === 'target is not empty' ||
    /^verification mismatch(?:: (counts|ID sets|business fields|duration aggregates|foreign keys|sessions|migration version))?$/.test(
      error.message,
    )
  ) {
    return error.message;
  }
  return 'migration failed';
}

if (require.main === module) {
  void runSqliteMigrationCli().catch((error: unknown) => {
    console.error(safeErrorMessage(error));
    process.exitCode = 1;
  });
}
