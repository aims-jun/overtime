import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { OvertimeRecordEntity } from './entities/overtime-record.entity';
import { SessionEntity } from './entities/session.entity';
import { UserEntity } from './entities/user.entity';
import { InitialSchema1752360000000 } from './migrations/0001-initial-schema';
import { AddOvertimeOverlapConstraint1753500000000 } from './migrations/0002-add-overtime-overlap-constraint';

export function createTypeOrmOptions(
  databaseUrl: string,
): PostgresConnectionOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    entities: [UserEntity, SessionEntity, OvertimeRecordEntity],
    migrations: [
      InitialSchema1752360000000,
      AddOvertimeOverlapConstraint1753500000000,
    ],
    synchronize: false,
    migrationsRun: false,
    extra: { max: 10 },
  };
}
