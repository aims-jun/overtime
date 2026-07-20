export type SqliteUserRow = {
  id: string;
  googleSubject: string;
  email: string;
  name: string;
  profileImageUrl: string | null;
  createdAt: string;
  lastLoginAt: string;
};

export type SqliteOvertimeRow = {
  id: string;
  userId: string;
  workDate: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  reason: string;
  createdAt: string;
  updatedAt: string;
};

export type NormalizedUserRow = Omit<
  SqliteUserRow,
  'createdAt' | 'lastLoginAt'
> & {
  createdAt: Date;
  lastLoginAt: Date;
};

export type NormalizedOvertimeRow = Omit<
  SqliteOvertimeRow,
  'startAt' | 'endAt' | 'createdAt' | 'updatedAt'
> & {
  startAt: Date;
  endAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type MigrationCounts = {
  users: number;
  overtimeRecords: number;
};

export type MigrationHashes = {
  userIds: string;
  overtimeRecordIds: string;
  businessFields: string;
  durationAggregates: string;
};

export type MigrationReport = {
  source: MigrationCounts;
  target: MigrationCounts;
  sourceHashes: MigrationHashes;
  targetHashes: MigrationHashes;
};
