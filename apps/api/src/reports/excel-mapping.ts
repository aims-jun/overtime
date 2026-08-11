import { DateTime } from 'luxon';

export function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${year % 100}년 ${monthNumber}월`;
}

function firstSundayDay(date: DateTime): number {
  // weekday: 1(월)~7(일). 1일이 일요일이면 첫 일요일은 1일.
  return 8 - date.startOf('month').weekday;
}

export function weekOfMonth(workDate: string): string {
  const date = DateTime.fromISO(workDate);
  const firstSunday = firstSundayDay(date);
  if (date.day <= firstSunday) return '1주차';
  return `${2 + Math.floor((date.day - firstSunday - 1) / 7)}주차`;
}

export function weekCountOfMonth(month: string): number {
  const lastDay = DateTime.fromISO(`${month}-01`).endOf('month');
  return Number.parseInt(weekOfMonth(lastDay.toFormat('yyyy-MM-dd')), 10);
}

export function workTypeFor(workDate: string): '연장근로' | '휴일근로' {
  return DateTime.fromISO(workDate).weekday >= 6 ? '휴일근로' : '연장근로';
}

export function excelDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function excelTime(time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(Date.UTC(1899, 11, 30) + (hours * 60 + minutes) * 60_000);
}
