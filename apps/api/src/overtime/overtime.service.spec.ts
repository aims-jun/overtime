import { OvertimeRecordEntity } from '../database/entities/overtime-record.entity';
import {
  OvertimeNotFoundError,
  OvertimeOverlapError,
} from './domain/overtime.errors';
import { OvertimeRepository } from './overtime.repository';
import { OvertimeService } from './overtime.service';

const userId = 'user-1';
const validInput = {
  workDate: '2026-07-13',
  startTime: '22:00',
  endTime: '01:30',
  reason: '  배포 대응  ',
};

function record(
  overrides: Partial<OvertimeRecordEntity> = {},
): OvertimeRecordEntity {
  return {
    id: 'record-1',
    userId,
    user: undefined as never,
    workDate: '2026-07-13',
    startAt: new Date('2026-07-13T13:00:00.000Z'),
    endAt: new Date('2026-07-13T16:30:00.000Z'),
    durationMinutes: 210,
    reason: '배포 대응',
    createdAt: new Date('2026-07-13T17:00:00.000Z'),
    updatedAt: new Date('2026-07-13T17:00:00.000Z'),
    ...overrides,
  };
}

describe('OvertimeService', () => {
  let service: OvertimeService;
  let repository: jest.Mocked<OvertimeRepository>;

  beforeEach(() => {
    repository = {
      listByUserAndWorkDateRange: jest.fn(),
      findOwnedById: jest.fn(),
      saveIfNoOverlap: jest.fn(),
      remove: jest.fn(),
    };
    repository.saveIfNoOverlap.mockImplementation((value) =>
      Promise.resolve(value),
    );
    service = new OvertimeService(repository);
  });

  it('calculates duration on the server and trims the reason', async () => {
    const result = await service.create(userId, validInput);

    expect(result).toMatchObject({
      workDate: '2026-07-13',
      startTime: '22:00',
      endTime: '01:30',
      durationMinutes: 210,
      reason: '배포 대응',
    });
    expect(repository.saveIfNoOverlap.mock.calls).toHaveLength(1);
  });

  it('rejects overlap with another owned record', async () => {
    repository.saveIfNoOverlap.mockResolvedValue(null);

    await expect(service.create(userId, validInput)).rejects.toBeInstanceOf(
      OvertimeOverlapError,
    );
  });

  it('hides another employee record as not found', async () => {
    repository.findOwnedById.mockResolvedValue(null);

    await expect(
      service.update(userId, 'other-record', validInput),
    ).rejects.toBeInstanceOf(OvertimeNotFoundError);
  });

  it('returns records and total minutes for the requested month', async () => {
    repository.listByUserAndWorkDateRange.mockResolvedValue([
      record(),
      record({ id: 'record-2', durationMinutes: 90 }),
    ]);

    await expect(service.listMine(userId, '2026-07')).resolves.toMatchObject({
      month: '2026-07',
      totalMinutes: 300,
      records: [{ id: 'record-1' }, { id: 'record-2' }],
    });
    expect(repository.listByUserAndWorkDateRange.mock.calls[0]).toEqual([
      userId,
      '2026-07-01',
      '2026-08-01',
    ]);
  });
});
