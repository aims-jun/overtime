import type { MigrationReport } from './types';
import { formatMigrationSummary, safeErrorMessage } from './cli';

const REPORT: MigrationReport = {
  source: { users: 2, overtimeRecords: 3 },
  target: { users: 2, overtimeRecords: 3 },
  sourceHashes: {
    userIds: 'user-hash',
    overtimeRecordIds: 'record-hash',
    businessFields: 'private-business-hash',
    durationAggregates: 'duration-hash',
  },
  targetHashes: {
    userIds: 'user-hash',
    overtimeRecordIds: 'record-hash',
    businessFields: 'private-business-hash',
    durationAggregates: 'duration-hash',
  },
};

describe('SQLite migration CLI safety', () => {
  it('formats only the approved count and status summary', () => {
    expect(formatMigrationSummary(REPORT)).toBe(
      '{"users":2,"overtimeRecords":3,"sessionsMigrated":0,"verification":"passed"}',
    );
  });

  it.each([
    'invalid UUID at users row not-a-uuid',
    'invalid timestamp at overtime_records row aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'target is not empty',
    'verification mismatch: foreign keys',
    'verification mismatch: sessions',
    'verification mismatch: migration version',
  ])('allows the safe migration error: %s', (message) => {
    expect(safeErrorMessage(new Error(message))).toBe(message);
  });

  it('replaces driver errors that may contain URLs or personal values', () => {
    expect(
      safeErrorMessage(
        new Error(
          'connect postgresql://user:secret@example/private person@example.com',
        ),
      ),
    ).toBe('migration failed');
  });
});
