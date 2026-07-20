import { parseMigrationEnv } from '../../config/migration-env.schema';
import { createMigrationDataSource } from '../migration-data-source';
import { migrateSqliteToPostgres } from './migrate';

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
    console.log(
      JSON.stringify({
        users: report.target.users,
        overtimeRecords: report.target.overtimeRecords,
        sessionsMigrated: 0,
        verification: 'passed',
      }),
    );
  } finally {
    await target.destroy();
  }
}

function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'migration failed';
  if (
    /^(invalid UUID|invalid timestamp|invalid work date) at (users|overtime_records) row [0-9a-z-]+$/i.test(
      error.message,
    ) ||
    error.message === 'target is not empty' ||
    error.message === 'verification mismatch'
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
