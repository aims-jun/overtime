import type { DataSource } from 'typeorm';
import { createMigrationDataSource } from '../src/database/migration-data-source';
import './setup-env';

type PostgresTestGlobal = typeof globalThis & {
  __POSTGRES_MIGRATION_DATA_SOURCE__?: DataSource;
};

export default async function postgresGlobalSetup(): Promise<void> {
  const databaseUrl = process.env.DATABASE_MIGRATION_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_MIGRATION_URL is required for PostgreSQL E2E');
  }

  const dataSource = createMigrationDataSource(databaseUrl);
  await dataSource.initialize();

  try {
    await dataSource.dropDatabase();
    await dataSource.runMigrations();
    (globalThis as PostgresTestGlobal).__POSTGRES_MIGRATION_DATA_SOURCE__ =
      dataSource;
  } catch (error) {
    await dataSource.destroy();
    throw error;
  }
}
