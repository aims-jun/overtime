import type {
  MigrationCounts,
  NormalizedOvertimeRow,
  NormalizedUserRow,
} from './types';
import {
  assertCountsMatch,
  assertDurationAggregatesMatch,
  assertForeignKeysValid,
} from './verify';

const USER: NormalizedUserRow = {
  id: '11111111-1111-4111-8111-111111111111',
  googleSubject: 'subject',
  email: 'person@example.com',
  name: 'Person',
  profileImageUrl: null,
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  lastLoginAt: new Date('2026-07-02T00:00:00.000Z'),
};

const RECORD: NormalizedOvertimeRow = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  userId: USER.id,
  workDate: '2026-07-10',
  startAt: new Date('2026-07-10T09:00:00.000Z'),
  endAt: new Date('2026-07-10T10:00:00.000Z'),
  durationMinutes: 60,
  reason: 'Reason',
  createdAt: new Date('2026-07-10T10:00:00.000Z'),
  updatedAt: new Date('2026-07-10T10:00:00.000Z'),
};

describe('migration verification mechanisms', () => {
  it('detects a count mismatch independently', () => {
    const source: MigrationCounts = { users: 1, overtimeRecords: 1 };
    const target: MigrationCounts = { users: 1, overtimeRecords: 0 };

    expect(() => assertCountsMatch(source, target)).toThrow(
      'verification mismatch: counts',
    );
  });

  it('detects a duration aggregate mismatch independently', () => {
    expect(() =>
      assertDurationAggregatesMatch(
        [RECORD],
        [{ ...RECORD, durationMinutes: 61 }],
      ),
    ).toThrow('verification mismatch: duration aggregates');
  });

  it('detects an orphan foreign key independently of business hashes', () => {
    expect(() =>
      assertForeignKeysValid({ users: [], overtimeRecords: [RECORD] }),
    ).toThrow('verification mismatch: foreign keys');
  });
});
