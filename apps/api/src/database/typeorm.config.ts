import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import { OvertimeRecordEntity } from './entities/overtime-record.entity';
import { SessionEntity } from './entities/session.entity';
import { UserEntity } from './entities/user.entity';
import { InitialSchema1752360000000 } from './migrations/0001-initial-schema';

export function createTypeOrmOptions(database: string): DataSourceOptions {
  if (database !== ':memory:') {
    mkdirSync(dirname(resolve(database)), { recursive: true });
  }

  return {
    type: 'better-sqlite3',
    database,
    entities: [UserEntity, SessionEntity, OvertimeRecordEntity],
    migrations: [InitialSchema1752360000000],
    synchronize: false,
    migrationsRun: true,
  };
}
