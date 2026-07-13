import type { DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { parseEnv } from './env.schema';

export function createAppConfigModule(): Promise<DynamicModule> {
  return ConfigModule.forRoot({
    isGlobal: true,
    cache: true,
    validate: parseEnv,
  });
}
