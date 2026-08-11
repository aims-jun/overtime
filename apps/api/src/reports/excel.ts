import { Workbook, Worksheet } from 'exceljs';
import {
  excelDate,
  excelTime,
  monthLabel,
  weekCountOfMonth,
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
  buildSummarySheet(workbook.addWorksheet('집계'), input);
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
  buildCriteriaSheet(workbook.addWorksheet('기준'));
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

const CRITERIA_LINES = [
  '※ 주 52시간제: 근로기준법상 1주 최대 연장 근로 시간은 12시간으로 제한됩니다. ',
  '※ 평일 연장근로시 저녁 식사시간은 산정에서 제외하여야 함. 운영팀/ QA팀은 대부분 도시락을 먹으며 일하거나 식사를 안하고 근무하기 때문에 18시부터 기산으로 적용 → 직원에게 유리하게!',
  '   단, 휴일 근로시 점심시간은 확실히 제외',
  '※ 근무유형 - 연장근로, 휴일근로',
];

function buildSummarySheet(sheet: Worksheet, input: ReportExcelInput): void {
  const weekCount = weekCountOfMonth(input.month);
  const weekLabels = Array.from(
    { length: weekCount },
    (_, index) => `${index + 1}주차`,
  );
  const summaryColumn = 2 + weekCount;
  const grandColumn = summaryColumn + 1;
  sheet.getColumn(1).width = 15.43;
  for (let column = 2; column < summaryColumn; column += 1) {
    sheet.getColumn(column).width = 6.14;
  }
  sheet.getColumn(summaryColumn).width = 12.57;
  sheet.getColumn(grandColumn).width = 6.86;

  const label = monthLabel(input.month);
  writeSummaryCell(sheet, 3, 1, 'Sum of 연장근무');
  writeSummaryCell(sheet, 3, 2, '열 레이블');
  writeSummaryCell(sheet, 4, 2, label);
  writeSummaryCell(sheet, 4, summaryColumn, `${label} 요약`);
  writeSummaryCell(sheet, 4, grandColumn, '총합계');
  writeSummaryCell(sheet, 5, 1, '행 레이블');
  weekLabels.forEach((week, index) => {
    writeSummaryCell(sheet, 5, 2 + index, week);
  });

  if (input.rows.length === 0) {
    return;
  }

  const hoursByNameAndWeek = new Map<string, Map<string, number>>();
  for (const row of input.rows) {
    const week = weekOfMonth(row.workDate);
    const perWeek =
      hoursByNameAndWeek.get(row.name) ?? new Map<string, number>();
    perWeek.set(week, (perWeek.get(week) ?? 0) + row.durationMinutes / 60);
    hoursByNameAndWeek.set(row.name, perWeek);
  }
  const names = [...hoursByNameAndWeek.keys()].sort((a, b) =>
    a.localeCompare(b, 'ko'),
  );
  const weekTotals = new Map<string, number>();
  let rowNumber = 6;
  for (const name of names) {
    const perWeek = hoursByNameAndWeek.get(name) ?? new Map<string, number>();
    writeSummaryCell(sheet, rowNumber, 1, safeExcelText(name), 'left');
    let personTotal = 0;
    weekLabels.forEach((week, index) => {
      const hours = perWeek.get(week);
      if (hours !== undefined) {
        writeSummaryCell(sheet, rowNumber, 2 + index, hours);
        personTotal += hours;
        weekTotals.set(week, (weekTotals.get(week) ?? 0) + hours);
      }
    });
    writeSummaryCell(sheet, rowNumber, summaryColumn, personTotal);
    writeSummaryCell(sheet, rowNumber, grandColumn, personTotal);
    rowNumber += 1;
  }
  writeSummaryCell(sheet, rowNumber, 1, '총합계', 'left');
  let grandTotal = 0;
  weekLabels.forEach((week, index) => {
    const hours = weekTotals.get(week);
    if (hours !== undefined) {
      writeSummaryCell(sheet, rowNumber, 2 + index, hours);
      grandTotal += hours;
    }
  });
  writeSummaryCell(sheet, rowNumber, summaryColumn, grandTotal);
  writeSummaryCell(sheet, rowNumber, grandColumn, grandTotal);
}

function writeSummaryCell(
  sheet: Worksheet,
  row: number,
  column: number,
  value: string | number,
  horizontal?: 'left',
): void {
  const cell = sheet.getRow(row).getCell(column);
  cell.value = value;
  cell.font = { name: FONT, size: 12 };
  if (horizontal) {
    cell.alignment = { horizontal };
  }
}

function buildCriteriaSheet(sheet: Worksheet): void {
  sheet.getColumn(2).width = 100;
  CRITERIA_LINES.forEach((text, index) => {
    const cell = sheet.getCell(`B${2 + index}`);
    cell.value = text;
    cell.font = { name: FONT, size: 11 };
  });
}
