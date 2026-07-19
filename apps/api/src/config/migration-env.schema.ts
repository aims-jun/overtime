import { z } from 'zod';

export type MigrationEnv = {
  DATABASE_MIGRATION_URL: string;
  SQLITE_SOURCE_PATH: string;
};

const migrationEnvSchema = z.object({
  DATABASE_MIGRATION_URL: z
    .string()
    .url()
    .refine(
      (value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol),
      'PostgreSQL URL이어야 합니다.',
    ),
  SQLITE_SOURCE_PATH: z.string().trim().min(1),
});

export function parseMigrationEnv(input: NodeJS.ProcessEnv): MigrationEnv {
  return migrationEnvSchema.parse(input);
}
