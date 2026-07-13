import { InvalidOvertimeTimeError } from './overtime.errors';
import { buildOvertimeInterval, intervalsOverlap } from './overtime-time';
import type { OvertimeInterval } from './overtime-time';

function interval(startTime: string, endTime: string): OvertimeInterval {
  return buildOvertimeInterval({
    workDate: '2026-07-13',
    startTime,
    endTime,
  });
}

describe('buildOvertimeInterval', () => {
  it.each([
    [
      { workDate: '2026-07-13', startTime: '18:00', endTime: '20:30' },
      150,
      '2026-07-13T09:00:00.000Z',
      '2026-07-13T11:30:00.000Z',
    ],
    [
      { workDate: '2026-07-13', startTime: '22:00', endTime: '01:30' },
      210,
      '2026-07-13T13:00:00.000Z',
      '2026-07-13T16:30:00.000Z',
    ],
    [
      { workDate: '2026-07-13', startTime: '18:00', endTime: '10:00' },
      960,
      '2026-07-13T09:00:00.000Z',
      '2026-07-14T01:00:00.000Z',
    ],
  ])(
    'calculates Korean overtime %#',
    (input, durationMinutes, startIso, endIso) => {
      const result = buildOvertimeInterval(input);

      expect(result.durationMinutes).toBe(durationMinutes);
      expect(result.startAt.toISOString()).toBe(startIso);
      expect(result.endAt.toISOString()).toBe(endIso);
    },
  );

  it.each([
    { workDate: '2026-07-13', startTime: '18:00', endTime: '18:00' },
    { workDate: '2026-07-13', startTime: '18:00', endTime: '10:01' },
    { workDate: '2026-02-30', startTime: '18:00', endTime: '20:00' },
    { workDate: '2026-07-13', startTime: '24:00', endTime: '01:00' },
    { workDate: '2026-7-13', startTime: '18:00', endTime: '20:00' },
  ])('rejects invalid interval %#', (input) => {
    expect(() => buildOvertimeInterval(input)).toThrow(
      InvalidOvertimeTimeError,
    );
  });
});

describe('intervalsOverlap', () => {
  it('treats touching intervals as non-overlapping', () => {
    expect(
      intervalsOverlap(interval('18:00', '20:00'), interval('20:00', '21:00')),
    ).toBe(false);
  });

  it('detects partial and contained overlap', () => {
    expect(
      intervalsOverlap(interval('18:00', '20:00'), interval('19:30', '21:00')),
    ).toBe(true);
    expect(
      intervalsOverlap(interval('18:00', '22:00'), interval('19:00', '20:00')),
    ).toBe(true);
  });
});
