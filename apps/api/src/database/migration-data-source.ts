import { parseMigrationEnv } from '../config/migration-env.schema';
import { DataSource } from 'typeorm';
import { createTypeOrmOptions } from './typeorm.config';

export function createMigrationDataSource(
  databaseUrl = parseMigrationEnv(process.env).DATABASE_MIGRATION_URL,
): DataSource {
  return new DataSource(createTypeOrmOptions(databaseUrl));
}
