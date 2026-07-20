import { parseMigrationEnv } from '../../config/migration-env.schema';
import { createMigrationDataSource } from '../migration-data-source';
import { safeErrorMessage } from './cli';
import {
  verifySqliteToPostgresAfterCommit,
  type PostMigrationVerificationReport,
} from './post-verify';

export async function runPostMigrationVerificationCli(): Promise<void> {
  const { DATABASE_MIGRATION_URL, SQLITE_SOURCE_PATH } = parseMigrationEnv(
    process.env,
  );
  const target = createMigrationDataSource(DATABASE_MIGRATION_URL);
  await target.initialize();

  try {
    const report = await verifySqliteToPostgresAfterCommit({
      sqlitePath: SQLITE_SOURCE_PATH,
      target,
    });
    console.log(formatPostMigrationVerificationSummary(report));
  } finally {
    await target.destroy();
  }
}

export function formatPostMigrationVerificationSummary(
  report: PostMigrationVerificationReport,
): string {
  return JSON.stringify({
    source: report.source.counts,
    target: report.target.counts,
    hashes: report.source.hashes,
    sessions: report.sessions,
    orphans: report.orphans,
    migrations: report.migrations,
    verification: 'passed',
  });
}

if (require.main === module) {
  void runPostMigrationVerificationCli().catch((error: unknown) => {
    console.error(safeErrorMessage(error));
    process.exitCode = 1;
  });
}
