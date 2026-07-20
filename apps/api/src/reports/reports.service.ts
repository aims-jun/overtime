import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { InvalidOvertimeInputError } from '../overtime/domain/overtime.errors';
import { buildReportExcel } from './excel';
import { ReportsRepository } from './reports.repository';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIME_ZONE = 'Asia/Seoul';

export type MonthlyReportQuery = { month: string; userId?: string };
export type AdminUserView = { id: string; name: string; email: string };
export type AdminOvertimeRow = {
  id: string;
  user: AdminUserView;
  workDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  reason: string;
};
export type MonthlyAdminReport = {
  month: string;
  userId?: string;
  totalMinutes: number;
  totalsByUser: Array<{ user: AdminUserView; totalMinutes: number }>;
  records: AdminOvertimeRow[];
};

@Injectable()
export class ReportsService {
  constructor(private readonly repository: ReportsRepository) {}

  async listUsers(): Promise<AdminUserView[]> {
    return (await this.repository.listUsers()).map((user) =>
      this.userView(user),
    );
  }

  async monthly(query: MonthlyReportQuery): Promise<MonthlyAdminReport> {
    const records = await this.rows(query);
    const totals = new Map<
      string,
      { user: AdminUserView; totalMinutes: number }
    >();
    for (const record of records) {
      const current = totals.get(record.user.id) ?? {
        user: record.user,
        totalMinutes: 0,
      };
      current.totalMinutes += record.durationMinutes;
      totals.set(record.user.id, current);
    }
    return {
      ...query,
      totalMinutes: records.reduce(
        (sum, record) => sum + record.durationMinutes,
        0,
      ),
      totalsByUser: [...totals.values()],
      records,
    };
  }

  async excel(query: MonthlyReportQuery): Promise<Buffer> {
    const records = await this.rows(query);
    return buildReportExcel(
      records.map((record) => ({
        workDate: record.workDate,
        name: record.user.name,
        email: record.user.email,
        startTime: record.startTime,
        endTime: record.endTime,
        durationMinutes: record.durationMinutes,
        reason: record.reason,
      })),
    );
  }

  private async rows(query: MonthlyReportQuery): Promise<AdminOvertimeRow[]> {
    const range = this.range(query);
    const records = await this.repository.listRecords(range);
    return records.map((record) => ({
      id: record.id,
      user: this.userView(record.user),
      workDate: record.workDate,
      startTime: DateTime.fromJSDate(record.startAt)
        .setZone(TIME_ZONE)
        .toFormat('HH:mm'),
      endTime: DateTime.fromJSDate(record.endAt)
        .setZone(TIME_ZONE)
        .toFormat('HH:mm'),
      durationMinutes: record.durationMinutes,
      reason: record.reason,
    }));
  }

  private range(query: MonthlyReportQuery): {
    from: string;
    toExclusive: string;
    userId?: string;
  } {
    if (!MONTH_PATTERN.test(query.month)) {
      throw new InvalidOvertimeInputError('조회할 월을 확인해주세요');
    }
    if (query.userId && !UUID_PATTERN.test(query.userId)) {
      throw new InvalidOvertimeInputError('직원 식별자를 확인해주세요');
    }
    const start = DateTime.fromISO(`${query.month}-01`, { zone: TIME_ZONE });
    return {
      from: start.toFormat('yyyy-MM-dd'),
      toExclusive: start.plus({ months: 1 }).toFormat('yyyy-MM-dd'),
      userId: query.userId,
    };
  }

  private userView(user: {
    id: string;
    name: string;
    email: string;
  }): AdminUserView {
    return { id: user.id, name: user.name, email: user.email };
  }
}
