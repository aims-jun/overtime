import type {
  NormalizedOvertimeRow,
  NormalizedUserRow,
  SqliteOvertimeRow,
  SqliteUserRow,
} from './types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORK_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function validate(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function normalizeUuid(value: string, table: string, rowId: string): string {
  if (!validate(value)) {
    throw new Error(`invalid UUID at ${table} row ${rowId}`);
  }
  return value.toLowerCase();
}

function parseTimestamp(value: string, table: string, rowId: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`invalid timestamp at ${table} row ${rowId}`);
  }
  return date;
}

function normalizeWorkDate(value: string, rowId: string): string {
  const match = WORK_DATE_PATTERN.exec(value);
  if (!match) {
    throw new Error(`invalid work date at overtime_records row ${rowId}`);
  }
  const [, year, month, day] = match;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day)
  ) {
    throw new Error(`invalid work date at overtime_records row ${rowId}`);
  }
  return value;
}

export function normalizeUserRow(row: SqliteUserRow): NormalizedUserRow {
  return {
    id: normalizeUuid(row.id, 'users', row.id),
    googleSubject: row.googleSubject,
    email: row.email,
    name: row.name,
    profileImageUrl: row.profileImageUrl,
    createdAt: parseTimestamp(row.createdAt, 'users', row.id),
    lastLoginAt: parseTimestamp(row.lastLoginAt, 'users', row.id),
  };
}

export function normalizeOvertimeRow(
  row: SqliteOvertimeRow,
): NormalizedOvertimeRow {
  return {
    id: normalizeUuid(row.id, 'overtime_records', row.id),
    userId: normalizeUuid(row.userId, 'overtime_records', row.id),
    workDate: normalizeWorkDate(row.workDate, row.id),
    startAt: parseTimestamp(row.startAt, 'overtime_records', row.id),
    endAt: parseTimestamp(row.endAt, 'overtime_records', row.id),
    durationMinutes: row.durationMinutes,
    reason: row.reason,
    createdAt: parseTimestamp(row.createdAt, 'overtime_records', row.id),
    updatedAt: parseTimestamp(row.updatedAt, 'overtime_records', row.id),
  };
}
