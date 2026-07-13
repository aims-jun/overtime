import type { OvertimeRecordEntity } from '../database/entities/overtime-record.entity';

export abstract class OvertimeRepository {
  abstract listByUserAndWorkDateRange(
    userId: string,
    from: string,
    toExclusive: string,
  ): Promise<OvertimeRecordEntity[]>;
  abstract findOwnedById(
    userId: string,
    id: string,
  ): Promise<OvertimeRecordEntity | null>;
  abstract saveIfNoOverlap(
    record: OvertimeRecordEntity,
  ): Promise<OvertimeRecordEntity | null>;
  abstract remove(record: OvertimeRecordEntity): Promise<void>;
}
