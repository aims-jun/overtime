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

function createRepository(save: jest.Mock): TypeOrmOvertimeRepository {
  const builder = {
    where: jest.fn(),
    andWhere: jest.fn(),
    getOne: jest.fn().mockResolvedValue(null),
  };
  builder.where.mockReturnValue(builder);
  builder.andWhere.mockReturnValue(builder);

  const dataSource = {
    transaction: jest.fn((work) =>
      work({
        getRepository: () => ({
          createQueryBuilder: () => builder,
          save,
        }),
      }),
    ),
  } as unknown as DataSource;

  return new TypeOrmOvertimeRepository(
    {} as Repository<OvertimeRecordEntity>,
    dataSource,
  );
}

describe('TypeOrmOvertimeRepository', () => {
  it('returns null when PostgreSQL rejects an overlapping time range', async () => {
    const repository = createRepository(
      jest.fn().mockRejectedValue({ code: '23P01' }),
    );

    await expect(repository.saveIfNoOverlap(record())).resolves.toBeNull();
  });

  it('rethrows database failures other than an overlap violation', async () => {
    const databaseError = new Error('database unavailable');
    const repository = createRepository(jest.fn().mockRejectedValue(databaseError));

    await expect(repository.saveIfNoOverlap(record())).rejects.toBe(
      databaseError,
    );
  });
});
