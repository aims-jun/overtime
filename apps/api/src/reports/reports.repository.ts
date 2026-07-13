import type { OvertimeRecordEntity } from '../database/entities/overtime-record.entity';
import type { UserEntity } from '../database/entities/user.entity';

export type ReportRecordQuery = {
  from: string;
  toExclusive: string;
  userId?: string;
};

export abstract class ReportsRepository {
  abstract listUsers(): Promise<UserEntity[]>;
  abstract listRecords(
    query: ReportRecordQuery,
  ): Promise<OvertimeRecordEntity[]>;
}
