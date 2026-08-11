import {
  excelDate,
  excelTime,
  monthLabel,
  weekCountOfMonth,
  weekOfMonth,
  workTypeFor,
} from './excel-mapping';

describe('excel mapping', () => {
  it('formats month label', () => {
    expect(monthLabel('2026-08')).toBe('26년 8월');
    expect(monthLabel('2025-12')).toBe('25년 12월');
  });

  it.each([
    // 2026-06-01은 월요일: 1주차 = 6/1~6/7
    ['2026-06-04', '1주차'],
    ['2026-06-16', '3주차'],
    ['2026-06-23', '4주차'],
    ['2026-06-29', '5주차'],
    // 2025-08-01은 금요일: 1주차 = 8/1~8/3
    ['2025-08-03', '1주차'],
    ['2025-08-04', '2주차'],
    ['2025-08-31', '5주차'],
    // 2026-08-01은 토요일 + 31일: 6주차까지 존재
    ['2026-08-31', '6주차'],
    // 2026-02-01은 일요일: 1주차 = 2/1 하루
    ['2026-02-01', '1주차'],
    ['2026-02-02', '2주차'],
  ])('computes week of month for %s', (date, expected) => {
    expect(weekOfMonth(date)).toBe(expected);
  });

  it('counts weeks in a month', () => {
    expect(weekCountOfMonth('2026-06')).toBe(5);
    expect(weekCountOfMonth('2025-08')).toBe(5);
    expect(weekCountOfMonth('2026-08')).toBe(6);
  });

  it.each([
    ['2026-08-10', '연장근로'], // 월
    ['2026-08-08', '휴일근로'], // 토
    ['2026-08-09', '휴일근로'], // 일
  ])('classifies work type for %s', (date, expected) => {
    expect(workTypeFor(date)).toBe(expected);
  });

  it('builds excel date and time values', () => {
    expect(excelDate('2026-08-11').toISOString()).toBe(
      '2026-08-11T00:00:00.000Z',
    );
    expect(excelTime('17:30').toISOString()).toBe(
      '1899-12-30T17:30:00.000Z',
    );
    expect(excelTime('24:00').toISOString()).toBe(
      '1899-12-31T00:00:00.000Z',
    );
  });
});
