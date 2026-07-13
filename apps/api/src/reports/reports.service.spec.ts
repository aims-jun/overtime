import type { OvertimeRecordEntity } from '../database/entities/overtime-record.entity';
import type { UserEntity } from '../database/entities/user.entity';
import { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';

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
    const service = new ReportsService(repository);

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

  it('applies one user filter identically to JSON and CSV', async () => {
    const repository = new FakeReportsRepository();
    const service = new ReportsService(repository);

    const query = { month: '2026-07', userId: employee.id };
    const report = await service.monthly(query);
    const csv = await service.csv(query);

    expect(report.records).toHaveLength(1);
    expect(report.totalMinutes).toBe(120);
    expect(csv).toContain(employee.email);
    expect(csv).not.toContain(manager.email);
  });
});
