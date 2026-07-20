import { z } from 'zod';

export type DatabaseMigrationEnv = {
  DATABASE_MIGRATION_URL: string;
};

export type MigrationEnv = DatabaseMigrationEnv & {
  SQLITE_SOURCE_PATH: string;
};

const databaseMigrationEnvSchema = z.object({
  DATABASE_MIGRATION_URL: z
    .string()
    .url()
    .refine(
      (value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol),
      'PostgreSQL URL이어야 합니다.',
    ),
});

const migrationEnvSchema = databaseMigrationEnvSchema.extend({
  SQLITE_SOURCE_PATH: z.string().trim().min(1),
});

export function parseDatabaseMigrationEnv(
  input: NodeJS.ProcessEnv,
): DatabaseMigrationEnv {
  return databaseMigrationEnvSchema.parse(input);
}

export function parseMigrationEnv(input: NodeJS.ProcessEnv): MigrationEnv {
  return migrationEnvSchema.parse(input);
}
