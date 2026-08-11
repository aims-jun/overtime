import { Workbook, Worksheet } from 'exceljs';
import {
  excelDate,
  excelTime,
  monthLabel,
  weekOfMonth,
  workTypeFor,
} from './excel-mapping';

export type ReportExcelRow = {
  workDate: string;
  endDate: string;
  name: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  reason: string;
};

export type ReportExcelInput = {
  month: string;
  department: string;
  rows: ReportExcelRow[];
};

const FONT = '맑은 고딕';
const HEADER_FILL = 'FFD9E1F2';
const YELLOW_FILL = 'FFFFFF00';
const BLUE_FONT = 'FF0000FF';
const DATE_FMT = 'yyyy/mm/dd;@';
const TIME_FMT = 'h:mm;@';
const HISTORY_HEADERS = [
  'No. ',
  '월',
  '주차',
  '부서',
  '성명',
  '근무 유형',
  '시작일',
  '시간',
  '종료일',
  '시간',
  '연장 근무 시간',
  '연장근무',
  '공제 시간',
  '야간 근무 시간',
  '사유',
  '신청 일자',
  '결재 일자',
  '결재 상태',
  '신청서',
  '비고',
];
const HISTORY_WIDTHS: ReadonlyArray<[number, number]> = [
  [2, 9.86],
  [7, 11.14],
  [9, 11.14],
  [10, 9.43],
  [11, 16.86],
  [12, 9.86],
  [13, 15.86],
  [14, 14.71],
  [15, 45.14],
  [16, 12.14],
  [17, 12],
  [20, 17],
];

export function safeExcelText(value: string): string {
  return /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
}

export async function buildReportExcel(
  input: ReportExcelInput,
): Promise<Buffer> {
  const workbook = new Workbook();
  workbook.addWorksheet('집계');
  buildHistorySheet(
    workbook.addWorksheet('연장근무 이력', {
      views: [
        {
          state: 'frozen',
          xSplit: 5,
          ySplit: 3,
          zoomScale: 140,
          zoomScaleNormal: 140,
        },
      ],
    }),
    input,
  );
  workbook.addWorksheet('기준');
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function buildHistorySheet(sheet: Worksheet, input: ReportExcelInput): void {
  for (const [column, width] of HISTORY_WIDTHS) {
    sheet.getColumn(column).width = width;
  }

  const title = sheet.getCell('A1');
  title.value = '연장근무이력 관리';
  title.font = { name: FONT, size: 16, bold: true };
  sheet.getRow(1).height = 23;

  const header = sheet.getRow(3);
  header.height = 19;
  HISTORY_HEADERS.forEach((text, index) => {
    const cell = header.getCell(index + 1);
    cell.value = text;
    const emphasized = index === 10 || index === 11;
    cell.font = emphasized
      ? { name: FONT, size: 12, bold: true, color: { argb: BLUE_FONT } }
      : { name: FONT, size: 12 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: HEADER_FILL },
    };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  input.rows.forEach((row, index) => {
    writeHistoryRow(sheet, input, row, index);
  });
  sheet.autoFilter = `A3:T${3 + input.rows.length}`;
}

function writeHistoryRow(
  sheet: Worksheet,
  input: ReportExcelInput,
  row: ReportExcelRow,
  index: number,
): void {
  const rowNumber = 4 + index;
  const isFirst = index === 0;
  const isLast = index === input.rows.length - 1;
  const hours = row.durationMinutes / 60;
  const cells: ReadonlyArray<
    [number, string | number | Date | { formula: string } | null, string?]
  > = [
    [1, index + 1],
    [2, monthLabel(input.month)],
    [3, weekOfMonth(row.workDate)],
    [4, safeExcelText(input.department)],
    [5, safeExcelText(row.name)],
    [6, workTypeFor(row.workDate)],
    [7, excelDate(row.workDate), DATE_FMT],
    [8, excelTime(row.startTime), TIME_FMT],
    [9, excelDate(row.endDate), DATE_FMT],
    [10, excelTime(row.endTime), TIME_FMT],
    [11, { formula: `J${rowNumber}-H${rowNumber}-M${rowNumber}` }, '[h]:mm'],
    [12, hours, Number.isInteger(hours) ? '0' : '0.#'],
    [13, excelTime('00:00'), TIME_FMT],
    [14, null],
    [15, safeExcelText(row.reason)],
    [16, null, DATE_FMT],
    [17, null, DATE_FMT],
    [18, null],
    [19, null],
    [20, null],
  ];
  const sheetRow = sheet.getRow(rowNumber);
  for (const [column, value, numFmt] of cells) {
    const cell = sheetRow.getCell(column);
    if (value !== null) {
      cell.value = value;
    }
    if (numFmt) {
      cell.numFmt = numFmt;
    }
    cell.font = { name: FONT, size: 10 };
    cell.border = {
      top: { style: isFirst ? 'medium' : 'thin' },
      bottom: { style: isLast ? 'medium' : 'thin' },
      left: { style: column === 1 ? 'medium' : 'thin' },
      right: { style: column === 20 ? 'medium' : 'thin' },
    };
    if (column === 12) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: YELLOW_FILL },
      };
    }
  }
}
