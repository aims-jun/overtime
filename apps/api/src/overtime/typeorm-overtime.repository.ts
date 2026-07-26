import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OvertimeRecordEntity } from '../database/entities/overtime-record.entity';
import { OvertimeRepository } from './overtime.repository';

function isPostgresExclusionViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23P01'
  );
}

@Injectable()
export class TypeOrmOvertimeRepository extends OvertimeRepository {
  constructor(
    @InjectRepository(OvertimeRecordEntity)
    private readonly repository: Repository<OvertimeRecordEntity>,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  listByUserAndWorkDateRange(
    userId: string,
    from: string,
    toExclusive: string,
  ): Promise<OvertimeRecordEntity[]> {
    return this.repository
      .createQueryBuilder('record')
      .where('record.userId = :userId', { userId })
      .andWhere('record.workDate >= :from', { from })
      .andWhere('record.workDate < :toExclusive', { toExclusive })
      .orderBy('record.workDate', 'ASC')
      .addOrderBy('record.startAt', 'ASC')
      .getMany();
  }

  findOwnedById(
    userId: string,
    id: string,
  ): Promise<OvertimeRecordEntity | null> {
    return this.repository.findOne({ where: { id, userId } });
  }

  saveIfNoOverlap(
    record: OvertimeRecordEntity,
  ): Promise<OvertimeRecordEntity | null> {
    return this.dataSource
      .transaction(async (manager) => {
        const repository = manager.getRepository(OvertimeRecordEntity);
        const overlap = await repository
          .createQueryBuilder('record')
          .where('record.userId = :userId', { userId: record.userId })
          .andWhere('record.id != :id', { id: record.id })
          .andWhere('record.startAt < :endAt', { endAt: record.endAt })
          .andWhere('record.endAt > :startAt', { startAt: record.startAt })
          .getOne();
        if (overlap) return null;
        return repository.save(record);
      })
      .catch((error: unknown) => {
        if (isPostgresExclusionViolation(error)) return null;
        throw error;
      });
  }

  async remove(record: OvertimeRecordEntity): Promise<void> {
    await this.repository.remove(record);
  }
}
