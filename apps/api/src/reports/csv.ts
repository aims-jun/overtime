export type ReportCsvRow = {
  workDate: string;
  name: string;
  email: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  reason: string;
};

export function csvCell(value: string): string {
  const safe = /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function buildReportCsv(rows: ReportCsvRow[]): string {
  const values = [
    ['근무일', '이름', '이메일', '시작', '종료', '야근(분)', '사유'],
    ...rows.map((row) => [
      row.workDate,
      row.name,
      row.email,
      row.startTime,
      row.endTime,
      String(row.durationMinutes),
      row.reason,
    ]),
  ];
  return `\uFEFF${values.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
