import { Workbook } from 'exceljs';
import { buildReportExcel, safeExcelText } from './excel';
import type { ReportExcelInput } from './excel';

function input(over: Partial<ReportExcelInput> = {}): ReportExcelInput {
  return {
    month: '2026-08',
    department: 'IT개발팀',
    rows: [
      {
        workDate: '2026-08-11', // 화요일, 3주차 (8/1 토 → 1주차=8/1~2)
        endDate: '2026-08-11',
        name: '김직원',
        startTime: '17:00',
        endTime: '18:30',
        durationMinutes: 90,
        reason: '배포 대응',
      },
      {
        workDate: '2026-08-08', // 토요일 → 휴일근로
        endDate: '2026-08-08',
        name: '박야근',
        startTime: '21:00',
        endTime: '24:00', // 자정 종료 관례
        durationMinutes: 180,
        reason: '=수식주입 시도',
      },
    ],
    ...over,
  };
}

async function load(value: ReportExcelInput) {
  const workbook = new Workbook();
  await workbook.xlsx.load(await buildReportExcel(value));
  return workbook;
}

describe('safeExcelText', () => {
  it.each(['=1+1', '+cmd', '-2+3', '@SUM(A1:A2)'])(
    'neutralizes formula text %s',
    (value) => {
      expect(safeExcelText(value)).toBe(`'${value}`);
    },
  );
});

describe('연장근무 이력 시트', () => {
  it('creates the three sheets in target order', async () => {
    const workbook = await load(input());
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      '집계',
      '연장근무 이력',
      '기준',
    ]);
  });

  it('writes title and styled header row', async () => {
    const sheet = (await load(input())).getWorksheet('연장근무 이력');
    expect(sheet?.getCell('A1').value).toBe('연장근무이력 관리');
    expect(sheet?.getCell('A1').font.bold).toBe(true);
    expect(sheet?.getCell('A1').font.size).toBe(16);
    expect(sheet?.getRow(3).getCell(1).value).toBe('No. ');
    expect(sheet?.getRow(3).getCell(11).value).toBe('연장 근무 시간');
    expect(sheet?.getRow(3).getCell(11).font.color?.argb).toBe('FF0000FF');
    expect(sheet?.getRow(3).getCell(12).font.bold).toBe(true);
    const fill = sheet?.getRow(3).getCell(2).fill;
    expect(fill && 'fgColor' in fill ? fill.fgColor?.argb : undefined).toBe(
      'FFD9E1F2',
    );
    expect(sheet?.views[0]).toMatchObject({
      state: 'frozen',
      xSplit: 5,
      ySplit: 3,
    });
    expect(sheet?.autoFilter).toBe('A3:T5');
  });

  it('maps a weekday record to a full row', async () => {
    const sheet = (await load(input())).getWorksheet('연장근무 이력');
    const row = sheet?.getRow(4);
    expect(row?.getCell(1).value).toBe(1);
    expect(row?.getCell(2).value).toBe('26년 8월');
    expect(row?.getCell(3).value).toBe('3주차');
    expect(row?.getCell(4).value).toBe('IT개발팀');
    expect(row?.getCell(5).value).toBe('김직원');
    expect(row?.getCell(6).value).toBe('연장근로');
    expect((row?.getCell(7).value as Date).toISOString()).toBe(
      '2026-08-11T00:00:00.000Z',
    );
    expect(row?.getCell(7).numFmt).toBe('yyyy/mm/dd;@');
    expect((row?.getCell(8).value as Date).toISOString()).toBe(
      '1899-12-30T17:00:00.000Z',
    );
    expect(row?.getCell(8).numFmt).toBe('h:mm;@');
    expect(row?.getCell(11).formula).toBe('J4-H4-M4');
    expect(row?.getCell(11).numFmt).toBe('[h]:mm');
    expect(row?.getCell(12).value).toBe(1.5);
    expect(row?.getCell(12).numFmt).toBe('0.#');
    const fill = row?.getCell(12).fill;
    expect(fill && 'fgColor' in fill ? fill.fgColor?.argb : undefined).toBe(
      'FFFFFF00',
    );
    expect((row?.getCell(13).value as Date).toISOString()).toBe(
      '1899-12-30T00:00:00.000Z',
    );
    expect(row?.getCell(15).value).toBe('배포 대응');
  });

  it('marks weekend rows, 24:00 endings, and neutralizes reasons', async () => {
    const sheet = (await load(input())).getWorksheet('연장근무 이력');
    const row = sheet?.getRow(5);
    expect(row?.getCell(6).value).toBe('휴일근로');
    expect((row?.getCell(9).value as Date).toISOString()).toBe(
      '2026-08-08T00:00:00.000Z',
    );
    expect((row?.getCell(10).value as Date).toISOString()).toBe(
      '1899-12-31T00:00:00.000Z',
    );
    expect(row?.getCell(12).value).toBe(3);
    expect(row?.getCell(12).numFmt).toBe('0');
    expect(row?.getCell(15).value).toBe("'=수식주입 시도");
  });

  it('draws a medium outer box around the data block', async () => {
    const sheet = (await load(input())).getWorksheet('연장근무 이력');
    expect(sheet?.getRow(4).getCell(1).border?.left?.style).toBe('medium');
    expect(sheet?.getRow(4).getCell(1).border?.top?.style).toBe('medium');
    expect(sheet?.getRow(4).getCell(20).border?.right?.style).toBe('medium');
    expect(sheet?.getRow(4).getCell(1).border?.bottom?.style).toBe('thin');
    expect(sheet?.getRow(5).getCell(1).border?.bottom?.style).toBe('medium');
  });

  it('produces a headers-only sheet for an empty month', async () => {
    const sheet = (await load(input({ rows: [] }))).getWorksheet(
      '연장근무 이력',
    );
    expect(sheet?.getRow(3).getCell(20).value).toBe('비고');
    expect(sheet?.getRow(4).getCell(1).value ?? null).toBeNull();
    expect(sheet?.autoFilter).toBe('A3:T3');
  });
});
