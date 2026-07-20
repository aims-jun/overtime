import Database from 'better-sqlite3';
import type { DataSource, EntityManager } from 'typeorm';
import { OvertimeRecordEntity } from '../entities/overtime-record.entity';
import { UserEntity } from '../entities/user.entity';
import { normalizeOvertimeRow, normalizeUserRow } from './normalize';
import type {
  MigrationReport,
  NormalizedOvertimeRow,
  NormalizedUserRow,
  SqliteOvertimeRow,
  SqliteUserRow,
} from './types';
import {
  assertDurationAggregatesMatch,
  assertForeignKeysValid,
  assertMigrationVerified,
  createMigrationSnapshot,
} from './verify';

const USERS_QUERY = `
  SELECT id, googleSubject, email, name, profileImageUrl, createdAt, lastLoginAt
  FROM users ORDER BY id
`;

const OVERTIME_RECORDS_QUERY = `
  SELECT id, userId, workDate, startAt, endAt, durationMinutes, reason, createdAt, updatedAt
  FROM overtime_records ORDER BY id
`;

type MigrationInput = {
  sqlitePath: string;
  target: DataSource;
  allowNonEmptyTarget?: false;
};

type MigrationRows = {
  users: NormalizedUserRow[];
  overtimeRecords: NormalizedOvertimeRow[];
};

export async function migrateSqliteToPostgres({
  sqlitePath,
  target,
}: MigrationInput): Promise<MigrationReport> {
  await assertEmptyTarget(target.manager);
  const rows = readSource(sqlitePath);
  assertForeignKeysValid(rows);
  const source = createMigrationSnapshot(rows);

  return target.transaction('SERIALIZABLE', async (manager) => {
    await assertEmptyTarget(manager);
    if (rows.users.length > 0) {
      await manager.insert(UserEntity, rows.users);
    }
    if (rows.overtimeRecords.length > 0) {
      await manager.insert(OvertimeRecordEntity, rows.overtimeRecords);
    }

    const targetRows = await readTarget(manager);
    const targetSnapshot = createMigrationSnapshot(targetRows);
    assertForeignKeysValid(targetRows);
    assertMigrationVerified(source, targetSnapshot);
    assertDurationAggregatesMatch(
      rows.overtimeRecords,
      targetRows.overtimeRecords,
    );

    return {
      source: source.counts,
      target: targetSnapshot.counts,
      sourceHashes: source.hashes,
      targetHashes: targetSnapshot.hashes,
    };
  });
}

function readSource(sqlitePath: string): MigrationRows {
  const database = new Database(sqlitePath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    return database.transaction(() => {
      const users = database
        .prepare(USERS_QUERY)
        .all()
        .map((row) => normalizeUserRow(row as SqliteUserRow));
      const overtimeRecords = database
        .prepare(OVERTIME_RECORDS_QUERY)
        .all()
        .map((row) => normalizeOvertimeRow(row as SqliteOvertimeRow));
      return { users, overtimeRecords };
    })();
  } finally {
    database.close();
  }
}

async function assertEmptyTarget(manager: EntityManager): Promise<void> {
  const [users, overtimeRecords] = await Promise.all([
    manager.count(UserEntity),
    manager.count(OvertimeRecordEntity),
  ]);
  if (users !== 0 || overtimeRecords !== 0) {
    throw new Error('target is not empty');
  }
}

async function readTarget(manager: EntityManager): Promise<MigrationRows> {
  const [users, overtimeRecords] = await Promise.all([
    manager.find(UserEntity, { order: { id: 'ASC' } }),
    manager.find(OvertimeRecordEntity, { order: { id: 'ASC' } }),
  ]);
  return { users, overtimeRecords };
}
