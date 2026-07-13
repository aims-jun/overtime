import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import type { OvertimeRecordEntity } from '../database/entities/overtime-record.entity';
import {
  InvalidOvertimeInputError,
  OvertimeNotFoundError,
  OvertimeOverlapError,
} from './domain/overtime.errors';
import { buildOvertimeInterval } from './domain/overtime-time';
import { OvertimeRepository } from './overtime.repository';

const SEOUL_TIME_ZONE = 'Asia/Seoul';
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export type SaveOvertimeInput = {
  workDate: string;
  startTime: string;
  endTime: string;
  reason: string;
};

export type OvertimeView = {
  id: string;
  workDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  reason: string;
  createdAt: string;
  updatedAt: string;
};

export type MonthlyOvertime = {
  month: string;
  totalMinutes: number;
  records: OvertimeView[];
};

@Injectable()
export class OvertimeService {
  constructor(private readonly repository: OvertimeRepository) {}

  async create(
    userId: string,
    input: SaveOvertimeInput,
  ): Promise<OvertimeView> {
    const record = this.buildRecord(userId, input);
    const saved = await this.repository.saveIfNoOverlap(record);
    if (!saved) {
      throw new OvertimeOverlapError();
    }
    return this.toView(saved);
  }

  async update(
    userId: string,
    id: string,
    input: SaveOvertimeInput,
  ): Promise<OvertimeView> {
    const existing = await this.repository.findOwnedById(userId, id);
    if (!existing) {
      throw new OvertimeNotFoundError();
    }
    const replacement = this.buildRecord(userId, input, existing);
    const saved = await this.repository.saveIfNoOverlap(replacement);
    if (!saved) {
      throw new OvertimeOverlapError();
    }
    return this.toView(saved);
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.repository.findOwnedById(userId, id);
    if (!existing) {
      throw new OvertimeNotFoundError();
    }
    await this.repository.remove(existing);
  }

  async listMine(userId: string, month: string): Promise<MonthlyOvertime> {
    const { from, toExclusive } = this.monthRange(month);
    const records = await this.repository.listByUserAndWorkDateRange(
      userId,
      from,
      toExclusive,
    );
    return {
      month,
      totalMinutes: records.reduce(
        (sum, record) => sum + record.durationMinutes,
        0,
      ),
      records: records.map((record) => this.toView(record)),
    };
  }

  private buildRecord(
    userId: string,
    input: SaveOvertimeInput,
    existing?: OvertimeRecordEntity,
  ): OvertimeRecordEntity {
    const reason = input.reason.trim();
    if (reason.length < 1 || reason.length > 500) {
      throw new InvalidOvertimeInputError('야근 사유는 1~500자로 입력해주세요');
    }
    const interval = buildOvertimeInterval(input);
    const now = new Date();
    return {
      id: existing?.id ?? randomUUID(),
      userId,
      user: existing?.user ?? (undefined as never),
      workDate: input.workDate,
      startAt: interval.startAt,
      endAt: interval.endAt,
      durationMinutes: interval.durationMinutes,
      reason,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
  }

  private monthRange(month: string): { from: string; toExclusive: string } {
    if (!MONTH_PATTERN.test(month)) {
      throw new InvalidOvertimeInputError('조회할 월을 확인해주세요');
    }
    const start = DateTime.fromISO(`${month}-01`, { zone: SEOUL_TIME_ZONE });
    if (!start.isValid) {
      throw new InvalidOvertimeInputError('조회할 월을 확인해주세요');
    }
    return {
      from: start.toFormat('yyyy-MM-dd'),
      toExclusive: start.plus({ months: 1 }).toFormat('yyyy-MM-dd'),
    };
  }

  private toView(record: OvertimeRecordEntity): OvertimeView {
    return {
      id: record.id,
      workDate: record.workDate,
      startTime: DateTime.fromJSDate(record.startAt)
        .setZone(SEOUL_TIME_ZONE)
        .toFormat('HH:mm'),
      endTime: DateTime.fromJSDate(record.endAt)
        .setZone(SEOUL_TIME_ZONE)
        .toFormat('HH:mm'),
      durationMinutes: record.durationMinutes,
      reason: record.reason,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
