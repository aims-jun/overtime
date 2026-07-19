import type { Migration } from 'typeorm';
import { parseMigrationEnv } from '../config/migration-env.schema';
import { createMigrationDataSource } from './migration-data-source';

type AppliedMigration = Pick<Migration, 'name'>;

type MigrationDataSource = {
  initialize(): Promise<unknown>;
  runMigrations(): Promise<AppliedMigration[]>;
  destroy(): Promise<void>;
};

type DataSourceFactory = (databaseUrl: string) => MigrationDataSource;

export async function runMigrations(
  databaseUrl: string,
  createDataSource: DataSourceFactory = createMigrationDataSource,
): Promise<string[]> {
  const dataSource = createDataSource(databaseUrl);
  await dataSource.initialize();

  try {
    const migrations = await dataSource.runMigrations();
    return migrations.map(migrationName);
  } finally {
    await dataSource.destroy();
  }
}

function migrationName(migration: AppliedMigration): string {
  return migration.name;
}

async function main(): Promise<void> {
  const { DATABASE_MIGRATION_URL } = parseMigrationEnv(process.env);
  const appliedMigrations = await runMigrations(DATABASE_MIGRATION_URL);
  for (const name of appliedMigrations) {
    console.log(name);
  }
}

if (require.main === module) {
  void main().catch(() => {
    console.error('Migration failed');
    process.exitCode = 1;
  });
}
