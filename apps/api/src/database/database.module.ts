import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { Env } from '../config/env.schema';
import { createTypeOrmOptions } from './typeorm.config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createTypeOrmOptions(config.get('DATABASE_PATH', { infer: true })),
    }),
  ],
})
export class DatabaseModule {}
