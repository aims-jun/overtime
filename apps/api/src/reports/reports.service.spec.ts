import type { ConfigService } from '@nestjs/config';
import type { OvertimeRecordEntity } from '../database/entities/overtime-record.entity';
import type { UserEntity } from '../database/entities/user.entity';
import type { Env } from '../config/env.schema';
import { Workbook } from 'exceljs';
import { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';

const config = {
  get: jest.fn().mockReturnValue('IT개발팀'),
} as unknown as ConfigService<Env, true>;

const employee = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '김직원',
  email: 'worker@company.com',
} as UserEntity;
const manager = {
  id: '22222222-2222-4222-8222-222222222222',
  name: '박관리',
  email: 'admin@company.com',
} as UserEntity;

function record(
  id: string,
  user: UserEntity,
  durationMinutes: number,
): OvertimeRecordEntity {
  return {
    id,
    userId: user.id,
    user,
    workDate: '2026-07-13',
    startAt: new Date('2026-07-13T09:00:00.000Z'),
    endAt: new Date(
      new Date('2026-07-13T09:00:00.000Z').getTime() + durationMinutes * 60_000,
    ),
    durationMinutes,
    reason: '업무',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

class FakeReportsRepository extends ReportsRepository {
  users = [employee, manager];
  records = [record('a', employee, 120), record('b', manager, 30)];
  latestQuery?: { from: string; toExclusive: string; userId?: string };

  listUsers(): Promise<UserEntity[]> {
    return Promise.resolve(this.users);
  }

  listRecords(query: {
    from: string;
    toExclusive: string;
    userId?: string;
  }): Promise<OvertimeRecordEntity[]> {
    this.latestQuery = query;
    return Promise.resolve(
      query.userId
        ? this.records.filter((item) => item.userId === query.userId)
        : this.records,
    );
  }
}

describe('ReportsService', () => {
  it('aggregates the exact monthly rows by employee', async () => {
    const repository = new FakeReportsRepository();
    const service = new ReportsService(repository, config);

    const report = await service.monthly({ month: '2026-07' });

    expect(repository.latestQuery).toEqual({
      from: '2026-07-01',
      toExclusive: '2026-08-01',
      userId: undefined,
    });
    expect(report.totalMinutes).toBe(150);
    expect(report.totalsByUser).toEqual([
      {
        user: { id: employee.id, name: employee.name, email: employee.email },
        totalMinutes: 120,
      },
      {
        user: { id: manager.id, name: manager.name, email: manager.email },
        totalMinutes: 30,
      },
    ]);
  });

  it('builds the company-format excel with korean filename', async () => {
    const repository = new FakeReportsRepository();
    const service = new ReportsService(repository, config);
    const { buffer, fileName, asciiFileName } = await service.excel({
      month: '2026-07',
    });
    expect(fileName).toBe('연장 근무 이력_IT개발팀_2607.xlsx');
    expect(asciiFileName).toBe('overtime-2607.xlsx');
    const workbook = new Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('연장근무 이력');
    expect(sheet?.getRow(4).getCell(5).value).toBe('김직원');
    expect(sheet?.getRow(4).getCell(4).value).toBe('IT개발팀');
  });

  it('applies the midnight rules to end date and time', async () => {
    const repository = new FakeReportsRepository();
    repository.records = [
      {
        ...record('m1', employee, 240),
        startAt: new Date('2026-07-13T11:00:00.000Z'), // 20:00 KST
        endAt: new Date('2026-07-13T15:00:00.000Z'), // 정확히 자정 (7/14 00:00 KST)
      },
      {
        ...record('m2', manager, 330),
        startAt: new Date('2026-07-13T11:00:00.000Z'), // 20:00 KST
        endAt: new Date('2026-07-13T16:30:00.000Z'), // 익일 01:30 KST
      },
    ];
    const service = new ReportsService(repository, config);
    const { buffer } = await service.excel({ month: '2026-07' });
    const workbook = new Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('연장근무 이력');
    expect((sheet?.getRow(4).getCell(9).value as Date).toISOString()).toBe(
      '2026-07-13T00:00:00.000Z',
    );
    expect((sheet?.getRow(4).getCell(10).value as Date).toISOString()).toBe(
      '1899-12-31T00:00:00.000Z',
    );
    expect((sheet?.getRow(5).getCell(9).value as Date).toISOString()).toBe(
      '2026-07-14T00:00:00.000Z',
    );
    expect((sheet?.getRow(5).getCell(10).value as Date).toISOString()).toBe(
      '1899-12-30T01:30:00.000Z',
    );
  });
});
