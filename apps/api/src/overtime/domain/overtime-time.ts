export type OvertimeTimeInput = {
  workDate: string;
  startTime: string;
  endTime: string;
};

export type OvertimeInterval = {
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
};

export function buildOvertimeInterval(
  input: OvertimeTimeInput,
): OvertimeInterval {
  if (
    !DATE_PATTERN.test(input.workDate) ||
    !TIME_PATTERN.test(input.startTime) ||
    !TIME_PATTERN.test(input.endTime)
  ) {
    throw new InvalidOvertimeTimeError();
  }

  const start = DateTime.fromISO(`${input.workDate}T${input.startTime}`, {
    zone: SEOUL_TIME_ZONE,
  });
  let end = DateTime.fromISO(`${input.workDate}T${input.endTime}`, {
    zone: SEOUL_TIME_ZONE,
  });

  if (!start.isValid || !end.isValid) {
    throw new InvalidOvertimeTimeError();
  }
  if (end < start) {
    end = end.plus({ days: 1 });
  }

  const durationMinutes = end.diff(start, 'minutes').minutes;
  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes <= 0 ||
    durationMinutes > MAX_DURATION_MINUTES
  ) {
    throw new InvalidOvertimeTimeError();
  }

  return {
    startAt: start.toUTC().toJSDate(),
    endAt: end.toUTC().toJSDate(),
    durationMinutes,
  };
}

export function intervalsOverlap(
  left: OvertimeInterval,
  right: OvertimeInterval,
): boolean {
  return (
    left.startAt.getTime() < right.endAt.getTime() &&
    right.startAt.getTime() < left.endAt.getTime()
  );
}
import { DateTime } from 'luxon';
import { InvalidOvertimeTimeError } from './overtime.errors';

const SEOUL_TIME_ZONE = 'Asia/Seoul';
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):(00|30)$/;
const MAX_DURATION_MINUTES = 16 * 60;
