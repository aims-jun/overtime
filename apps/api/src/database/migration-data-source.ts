import { parseDatabaseMigrationEnv } from '../config/migration-env.schema';
import { DataSource } from 'typeorm';
import { createTypeOrmOptions } from './typeorm.config';

export function createMigrationDataSource(
  databaseUrl = parseDatabaseMigrationEnv(process.env).DATABASE_MIGRATION_URL,
): DataSource {
  return new DataSource(createTypeOrmOptions(databaseUrl));
}
