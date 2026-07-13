import type { DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { parseEnv } from './env.schema';

export function resolveEnvFilePath(cwd = process.cwd()): string {
  return resolve(cwd, '../..', '.env');
}

export function createAppConfigModule(): Promise<DynamicModule> {
  return ConfigModule.forRoot({
    isGlobal: true,
    cache: true,
    envFilePath: [resolveEnvFilePath(), resolve(process.cwd(), '.env')],
    validate: parseEnv,
  });
}
