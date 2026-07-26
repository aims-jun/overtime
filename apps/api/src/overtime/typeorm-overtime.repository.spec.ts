import type { DataSource, Repository } from 'typeorm';
import { OvertimeRecordEntity } from '../database/entities/overtime-record.entity';
import { TypeOrmOvertimeRepository } from './typeorm-overtime.repository';

function record(): OvertimeRecordEntity {
  return {
    id: '47d6bfb4-518f-4ae9-8bf3-4855ea5d8175',
    userId: '417c01ca-c33a-458d-976f-0396d4f7eef2',
    user: undefined as never,
    workDate: '2026-07-13',
    startAt: new Date('2026-07-13T09:00:00.000Z'),
    endAt: new Date('2026-07-13T11:00:00.000Z'),
    durationMinutes: 120,
    reason: '배포 대응',
    createdAt: new Date('2026-07-13T11:00:00.000Z'),
    updatedAt: new Date('2026-07-13T11:00:00.000Z'),
  };
}

type FakeQueryBuilder = {
  where(query: string, parameters: Record<string, unknown>): FakeQueryBuilder;
  andWhere(
    query: string,
    parameters: Record<string, unknown>,
  ): FakeQueryBuilder;
  getOne(): Promise<OvertimeRecordEntity | null>;
};

type FakeRepository = {
  createQueryBuilder(alias: string): FakeQueryBuilder;
  save(value: OvertimeRecordEntity): Promise<OvertimeRecordEntity>;
};

type FakeManager = {
  getRepository(target: typeof OvertimeRecordEntity): FakeRepository;
};

type FakeDataSource = {
  transaction<T>(work: (manager: FakeManager) => Promise<T>): Promise<T>;
};

function createRepository(
  save: (value: OvertimeRecordEntity) => Promise<OvertimeRecordEntity>,
): TypeOrmOvertimeRepository {
  const builder: FakeQueryBuilder = {
    where: () => builder,
    andWhere: () => builder,
    getOne: () => Promise.resolve(null),
  };

  const dataSource: FakeDataSource = {
    transaction: async (work) =>
      work({
        getRepository: () => ({
          createQueryBuilder: () => builder,
          save,
        }),
      }),
  };

  return new TypeOrmOvertimeRepository(
    {} as Repository<OvertimeRecordEntity>,
    dataSource as unknown as DataSource,
  );
}

describe('TypeOrmOvertimeRepository', () => {
  it('returns null when PostgreSQL rejects an overlapping time range', async () => {
    const exclusionViolation = Object.assign(
      new Error('exclusion constraint violation'),
      { code: '23P01' },
    );
    const repository = createRepository(() =>
      Promise.reject(exclusionViolation),
    );

    await expect(repository.saveIfNoOverlap(record())).resolves.toBeNull();
  });

  it('rethrows database failures other than an overlap violation', async () => {
    const databaseError = new Error('database unavailable');
    const repository = createRepository(async () =>
      Promise.reject(databaseError),
    );

    await expect(repository.saveIfNoOverlap(record())).rejects.toBe(
      databaseError,
    );
  });
});
