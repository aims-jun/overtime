import { createHash } from 'node:crypto';
import type {
  MigrationCounts,
  MigrationHashes,
  NormalizedOvertimeRow,
  NormalizedUserRow,
} from './types';

type MigrationRows = {
  users: NormalizedUserRow[];
  overtimeRecords: NormalizedOvertimeRow[];
};

export type MigrationSnapshot = {
  counts: MigrationCounts;
  hashes: MigrationHashes;
};

export function hashRows(rows: readonly unknown[][]): string {
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

export function createMigrationSnapshot({
  users,
  overtimeRecords,
}: MigrationRows): MigrationSnapshot {
  const sortedUsers = [...users].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const sortedRecords = [...overtimeRecords].sort((left, right) =>
    left.id.localeCompare(right.id),
  );

  return {
    counts: {
      users: sortedUsers.length,
      overtimeRecords: sortedRecords.length,
    },
    hashes: {
      userIds: hashRows(sortedUsers.map(({ id }) => [id])),
      overtimeRecordIds: hashRows(sortedRecords.map(({ id }) => [id])),
      businessFields: hashRows([
        ...sortedUsers.map((row) => [
          'user',
          row.id,
          row.googleSubject,
          row.email,
          row.name,
          row.profileImageUrl,
          row.createdAt.toISOString(),
          row.lastLoginAt.toISOString(),
        ]),
        ...sortedRecords.map((row) => [
          'overtimeRecord',
          row.id,
          row.userId,
          row.workDate,
          row.startAt.toISOString(),
          row.endAt.toISOString(),
          row.durationMinutes,
          row.reason,
          row.createdAt.toISOString(),
          row.updatedAt.toISOString(),
        ]),
      ]),
      durationAggregates: hashRows(durationAggregateRows(sortedRecords)),
    },
  };
}

export function assertMigrationVerified(
  source: MigrationSnapshot,
  target: MigrationSnapshot,
): void {
  if (
    JSON.stringify(source.counts) !== JSON.stringify(target.counts) ||
    JSON.stringify(source.hashes) !== JSON.stringify(target.hashes)
  ) {
    throw new Error('verification mismatch');
  }
}

function durationAggregateRows(
  records: readonly NormalizedOvertimeRow[],
): unknown[][] {
  const durations = new Map<string, number>();
  for (const row of records) {
    const key = `${row.userId}\u0000${row.workDate}`;
    durations.set(key, (durations.get(key) ?? 0) + row.durationMinutes);
  }

  return [...durations]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, duration]) => {
      const [userId, workDate] = key.split('\u0000');
      return [userId, workDate, duration];
    });
}
