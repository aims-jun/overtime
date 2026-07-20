import { Workbook } from 'exceljs';

export type ReportExcelRow = {
  workDate: string;
  name: string;
  email: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  reason: string;
};

export function safeExcelText(value: string): string {
  return /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
}

function formatMinutes(value: number): string {
  if (value === 0) return '0시간';
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
}

export async function buildReportExcel(
  rows: ReportExcelRow[],
): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('업무연장 내역', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = [
    { header: '근무일', key: 'workDate', width: 14 },
    { header: '직원 이름', key: 'name', width: 16 },
    { header: '이메일', key: 'email', width: 30 },
    { header: '시작 시간', key: 'startTime', width: 14 },
    { header: '종료 시간', key: 'endTime', width: 14 },
    { header: '추가 근무', key: 'duration', width: 16 },
    { header: '업무 내용', key: 'reason', width: 40 },
  ];
  sheet.autoFilter = 'A1:G1';

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FF26301F' } };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFEAF7C7' },
  };

  for (const row of rows) {
    sheet.addRow({
      workDate: safeExcelText(row.workDate),
      name: safeExcelText(row.name),
      email: safeExcelText(row.email),
      startTime: safeExcelText(row.startTime),
      endTime: safeExcelText(row.endTime),
      duration: safeExcelText(formatMinutes(row.durationMinutes)),
      reason: safeExcelText(row.reason),
    });
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
