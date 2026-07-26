import type { PostMigrationVerificationReport } from './post-verify';
import { formatPostMigrationVerificationSummary } from './post-verify-cli';

const REPORT: PostMigrationVerificationReport = {
  source: {
    counts: { users: 2, overtimeRecords: 3 },
    hashes: {
      userIds: 'user-id-hash',
      overtimeRecordIds: 'record-id-hash',
      businessFields: 'business-hash',
      durationAggregates: 'duration-hash',
    },
  },
  target: {
    counts: { users: 2, overtimeRecords: 3 },
    hashes: {
      userIds: 'user-id-hash',
      overtimeRecordIds: 'record-id-hash',
      businessFields: 'business-hash',
      durationAggregates: 'duration-hash',
    },
  },
  sessions: 0,
  orphans: 0,
  migrations: [
    'InitialSchema1752360000000',
    'AddOvertimeOverlapConstraint1753500000000',
  ],
};

describe('post-migration verification CLI safety', () => {
  it('prints only counts, hashes, integrity gates, and status', () => {
    expect(formatPostMigrationVerificationSummary(REPORT)).toBe(
      JSON.stringify({
        source: { users: 2, overtimeRecords: 3 },
        target: { users: 2, overtimeRecords: 3 },
        hashes: REPORT.source.hashes,
        sessions: 0,
        orphans: 0,
        migrations: [
          'InitialSchema1752360000000',
          'AddOvertimeOverlapConstraint1753500000000',
        ],
        verification: 'passed',
      }),
    );
  });
});
