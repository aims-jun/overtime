import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OvertimeRecordEntity } from '../database/entities/overtime-record.entity';
import { UserEntity } from '../database/entities/user.entity';
import type { ReportRecordQuery } from './reports.repository';
import { ReportsRepository } from './reports.repository';

@Injectable()
export class TypeOrmReportsRepository extends ReportsRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(OvertimeRecordEntity)
    private readonly records: Repository<OvertimeRecordEntity>,
  ) {
    super();
  }

  listUsers(): Promise<UserEntity[]> {
    return this.users.find({ order: { name: 'ASC', email: 'ASC' } });
  }

  listRecords(query: ReportRecordQuery): Promise<OvertimeRecordEntity[]> {
    const builder = this.records
      .createQueryBuilder('record')
      .innerJoinAndSelect('record.user', 'user')
      .where('record.workDate >= :from', { from: query.from })
      .andWhere('record.workDate < :toExclusive', {
        toExclusive: query.toExclusive,
      });
    if (query.userId) {
      builder.andWhere('record.userId = :userId', { userId: query.userId });
    }
    return builder
      .orderBy('record.workDate', 'ASC')
      .addOrderBy('record.startAt', 'ASC')
      .addOrderBy('user.name', 'ASC')
      .getMany();
  }
}
