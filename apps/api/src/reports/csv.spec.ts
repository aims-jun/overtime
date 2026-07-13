import { buildReportCsv, csvCell } from './csv';

describe('CSV security', () => {
  it.each(['=1+1', '+cmd', '-2+3', '@SUM(A1:A2)'])(
    'neutralizes formula value %s',
    (value) => {
      expect(csvCell(value)).toBe(`'${value}`);
    },
  );

  it('adds a UTF-8 BOM and escapes commas and quotes', () => {
    const csv = buildReportCsv([
      {
        workDate: '2026-07-13',
        name: '김직원',
        email: 'worker@company.com',
        startTime: '18:00',
        endTime: '20:00',
        durationMinutes: 120,
        reason: '긴급, "배포"',
      },
    ]);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"긴급, ""배포"""');
  });
});
