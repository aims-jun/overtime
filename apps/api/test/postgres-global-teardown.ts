import type { DataSource } from 'typeorm';

type PostgresTestGlobal = typeof globalThis & {
  __POSTGRES_MIGRATION_DATA_SOURCE__?: DataSource;
};

export default async function postgresGlobalTeardown(): Promise<void> {
  const testGlobal = globalThis as PostgresTestGlobal;
  const dataSource = testGlobal.__POSTGRES_MIGRATION_DATA_SOURCE__;

  if (dataSource?.isInitialized) {
    await dataSource.destroy();
  }

  delete testGlobal.__POSTGRES_MIGRATION_DATA_SOURCE__;
}
