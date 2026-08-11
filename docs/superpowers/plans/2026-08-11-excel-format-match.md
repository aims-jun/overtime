# 관리자 Excel 내보내기 양식 일치 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 Excel 다운로드가 사내 표준 파일(`연장 근무 이력_IT개발팀_YYMM.xlsx`)과 같은 양식(시트 3개, 20컬럼, 스타일/서식/수식)으로 선택한 월의 데이터를 내려준다.

**Architecture:** exceljs로 프로그래밍 방식 생성. 순수 매핑 함수(`excel-mapping.ts`)와 워크북 조립(`excel.ts`)을 분리하고, 서비스가 부서명(환경변수)·월·행 데이터를 전달하며, 컨트롤러는 RFC 5987 한글 파일명을 내려준다. 집계 시트는 피벗 대신 같은 모양의 정적 값 표.

**Tech Stack:** NestJS 11, exceljs, luxon, Zod, Jest

**Spec:** `docs/superpowers/specs/2026-08-11-excel-format-match-design.md`

## Global Constraints

- 시트 순서·이름 고정: `집계`, `연장근무 이력`, `기준`
- 글꼴은 전부 `맑은 고딕`
- 헤더 A3 텍스트는 `No. ` (뒤 공백 포함)
- 색상: 헤더 배경 `FFD9E1F2`, L열 배경 `FFFFFF00`, K/L 헤더 글자 `FF0000FF`
- 날짜 서식 `yyyy/mm/dd;@`, 시간 서식 `h:mm;@`, K열 `[h]:mm`
- 주차 규칙: 월요일 시작, 1주차 = 1일부터 그 달의 첫 일요일까지
- 근무 유형: 토/일 → `휴일근로`, 평일 → `연장근로`
- 자정 종료(00:00)는 종료일=근무일, 시간=24:00으로 표기
- `safeExcelText`는 텍스트 셀(부서, 성명, 사유, 집계 이름)에만 적용
- 커밋 접두사는 기존 관례(test/feat/fix/docs) 유지, 본문 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- 테스트 실행은 `npm run test -w apps/api -- --runInBand <파일>` 형태

---

### Task 1: REPORT_DEPARTMENT 환경변수

**Files:**
- Modify: `apps/api/src/config/env.schema.ts`
- Test: `apps/api/src/config/env.schema.spec.ts`

**Interfaces:**
- Produces: `Env.REPORT_DEPARTMENT: string` (기본값 `IT개발팀`) — Task 5의 `ConfigService<Env, true>.get('REPORT_DEPARTMENT')`가 사용

- [ ] **Step 1: 실패하는 테스트 추가**

`apps/api/src/config/env.schema.spec.ts`의 기존 describe 안에 추가 (기존 테스트들이 쓰는 유효 env 픽스처가 있으면 재사용하고, 없으면 아래 `baseEnv` 사용):

```ts
const baseEnv = {
  APP_ORIGINS: 'https://overtime.example.com',
  DATABASE_URL: 'postgresql://overtime_app:pw@localhost:5432/overtime',
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_HOSTED_DOMAIN: 'aimskr.com',
  ADMIN_EMAILS: 'admin@aimskr.com',
  SESSION_COOKIE_NAME: 'overtime_session',
  SESSION_HASH_SECRET: 'x'.repeat(32),
};

it('defaults REPORT_DEPARTMENT to IT개발팀', () => {
  expect(parseEnv({ ...baseEnv }).REPORT_DEPARTMENT).toBe('IT개발팀');
});

it('uses the provided REPORT_DEPARTMENT', () => {
  expect(
    parseEnv({ ...baseEnv, REPORT_DEPARTMENT: '플랫폼팀' }).REPORT_DEPARTMENT,
  ).toBe('플랫폼팀');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -w apps/api -- --runInBand env.schema.spec.ts`
Expected: FAIL — `REPORT_DEPARTMENT` 프로퍼티가 타입/파싱 결과에 없음

- [ ] **Step 3: 스키마 구현**

`env.schema.ts`의 `Env` 타입에 `REPORT_DEPARTMENT: string;` 추가, zod 오브젝트의 `SESSION_HASH_SECRET` 다음에 추가:

```ts
REPORT_DEPARTMENT: z.string().trim().min(1).default('IT개발팀'),
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -w apps/api -- --runInBand env.schema.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/config/env.schema.ts apps/api/src/config/env.schema.spec.ts
git commit -m "feat(api): add REPORT_DEPARTMENT env

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 매핑 순수 함수 (excel-mapping.ts)

**Files:**
- Create: `apps/api/src/reports/excel-mapping.ts`
- Test: `apps/api/src/reports/excel-mapping.spec.ts`

**Interfaces:**
- Produces (Task 3~4가 사용):
  - `monthLabel(month: string): string` — `'2026-08'` → `'26년 8월'`
  - `weekOfMonth(workDate: string): string` — `'2026-08-11'` → `'3주차'`
  - `weekCountOfMonth(month: string): number` — 그 달의 마지막 주차 수 (4~6)
  - `workTypeFor(workDate: string): '연장근로' | '휴일근로'`
  - `excelDate(date: string): Date` — UTC 자정
  - `excelTime(time: string): Date` — 1899-12-30 기준, `'24:00'` 지원

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/api/src/reports/excel-mapping.spec.ts`:

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -w apps/api -- --runInBand excel-mapping.spec.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`apps/api/src/reports/excel-mapping.ts`:

```ts
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
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -w apps/api -- --runInBand excel-mapping.spec.ts`
Expected: PASS (전부)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/reports/excel-mapping.ts apps/api/src/reports/excel-mapping.spec.ts
git commit -m "feat(api): add excel report mapping helpers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: excel.ts 재작성 — 연장근무 이력 시트

**Files:**
- Modify: `apps/api/src/reports/excel.ts` (전면 재작성)
- Test: `apps/api/src/reports/excel.spec.ts` (전면 재작성)

**Interfaces:**
- Consumes: Task 2의 매핑 함수 전부
- Produces (Task 4~5가 사용):
  - `type ReportExcelRow = { workDate: string; endDate: string; name: string; startTime: string; endTime: string; durationMinutes: number; reason: string }`
  - `type ReportExcelInput = { month: string; department: string; rows: ReportExcelRow[] }`
  - `buildReportExcel(input: ReportExcelInput): Promise<Buffer>`
  - `safeExcelText(value: string): string` (기존 시그니처 유지)

주의: 이 태스크가 끝나면 기존 `reports.service.ts`가 옛 시그니처로 호출하고 있어 **API 워크스페이스 빌드가 일시적으로 깨진다.** Task 5에서 복구되므로 이 태스크에서는 `excel.spec.ts`만 통과시키면 된다.

- [ ] **Step 1: 실패하는 테스트 작성 (excel.spec.ts 전면 교체)**

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -w apps/api -- --runInBand excel.spec.ts`
Expected: FAIL — `buildReportExcel`이 배열 인자를 받는 옛 구현

- [ ] **Step 3: excel.ts 전면 재작성**

```ts
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
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -w apps/api -- --runInBand excel.spec.ts`
Expected: PASS (이력 시트 테스트 전부. 집계/기준 시트는 빈 시트라 이름 순서 테스트도 통과)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/reports/excel.ts apps/api/src/reports/excel.spec.ts
git commit -m "feat(api): rebuild excel history sheet to match company format

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 집계 시트(정적 표) + 기준 시트

**Files:**
- Modify: `apps/api/src/reports/excel.ts`
- Test: `apps/api/src/reports/excel.spec.ts` (테스트 추가)

**Interfaces:**
- Consumes: Task 2의 `weekCountOfMonth`, `weekOfMonth`, `monthLabel`; Task 3의 `ReportExcelInput`
- Produces: `buildReportExcel` 결과에 집계·기준 시트 내용 포함 (시그니처 변화 없음)

- [ ] **Step 1: 실패하는 테스트 추가 (excel.spec.ts 하단에 describe 추가)**

```ts
describe('집계 시트', () => {
  it('renders the pivot-shaped static table', async () => {
    const sheet = (await load(input())).getWorksheet('집계');
    // 2026-08: 1주차=8/1~2, 이후 월~일 → 6주차까지
    expect(sheet?.getCell('A3').value).toBe('Sum of 연장근무');
    expect(sheet?.getCell('B3').value).toBe('열 레이블');
    expect(sheet?.getCell('B4').value).toBe('26년 8월');
    expect(sheet?.getCell('H4').value).toBe('26년 8월 요약');
    expect(sheet?.getCell('I4').value).toBe('총합계');
    expect(sheet?.getCell('A5').value).toBe('행 레이블');
    expect(sheet?.getCell('B5').value).toBe('1주차');
    expect(sheet?.getCell('G5').value).toBe('6주차');
    // 가나다순: 김직원, 박야근
    expect(sheet?.getCell('A6').value).toBe('김직원');
    expect(sheet?.getCell('A6').alignment?.horizontal).toBe('left');
    expect(sheet?.getCell('D6').value).toBe(1.5); // 8/11 → 3주차
    expect(sheet?.getCell('B6').value ?? null).toBeNull(); // 기록 없는 주는 빈 칸
    expect(sheet?.getCell('H6').value).toBe(1.5);
    expect(sheet?.getCell('I6').value).toBe(1.5);
    expect(sheet?.getCell('A7').value).toBe('박야근');
    expect(sheet?.getCell('C7').value).toBe(3); // 8/8 → 2주차
    expect(sheet?.getCell('A8').value).toBe('총합계');
    expect(sheet?.getCell('H8').value).toBe(4.5);
    expect(sheet?.getCell('I8').value).toBe(4.5);
  });

  it('renders only label rows for an empty month', async () => {
    const sheet = (await load(input({ rows: [] }))).getWorksheet('집계');
    expect(sheet?.getCell('A5').value).toBe('행 레이블');
    expect(sheet?.getCell('A6').value ?? null).toBeNull();
  });
});

describe('기준 시트', () => {
  it('writes the four rule lines', async () => {
    const sheet = (await load(input())).getWorksheet('기준');
    expect(sheet?.getCell('B2').value).toBe(
      '※ 주 52시간제: 근로기준법상 1주 최대 연장 근로 시간은 12시간으로 제한됩니다. ',
    );
    expect(sheet?.getCell('B5').value).toBe('※ 근무유형 - 연장근로, 휴일근로');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -w apps/api -- --runInBand excel.spec.ts`
Expected: FAIL — 집계/기준 시트가 비어 있음

- [ ] **Step 3: 구현**

`excel.ts`의 `buildReportExcel`에서 빈 `addWorksheet` 두 줄을 함수 호출로 교체:

```ts
buildSummarySheet(workbook.addWorksheet('집계'), input);
// (이력 시트 생성 코드는 그대로)
buildCriteriaSheet(workbook.addWorksheet('기준'));
```

파일 하단에 추가:

```ts
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
```

import에 `weekCountOfMonth` 추가:

```ts
import {
  excelDate,
  excelTime,
  monthLabel,
  weekCountOfMonth,
  weekOfMonth,
  workTypeFor,
} from './excel-mapping';
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -w apps/api -- --runInBand excel.spec.ts`
Expected: PASS (전부)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/reports/excel.ts apps/api/src/reports/excel.spec.ts
git commit -m "feat(api): add summary and criteria sheets to excel export

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 서비스·컨트롤러 연결과 한글 파일명

**Files:**
- Modify: `apps/api/src/reports/reports.service.ts`
- Modify: `apps/api/src/reports/reports.controller.ts:37-54`
- Test: `apps/api/src/reports/reports.service.spec.ts`, `apps/api/src/reports/reports.controller.spec.ts`

**Interfaces:**
- Consumes: Task 3의 `buildReportExcel(input: ReportExcelInput)`, Task 1의 `Env.REPORT_DEPARTMENT`
- Produces: `ReportsService.excel(query): Promise<ReportExcelResult>` where `type ReportExcelResult = { buffer: Buffer; fileName: string; asciiFileName: string }`

- [ ] **Step 1: 서비스 테스트 갱신**

`reports.service.spec.ts`: 서비스 생성부에 ConfigService 스텁을 추가하고 excel 테스트를 교체. 생성자는 `new ReportsService(repository, config)`가 된다.

```ts
const config = {
  get: jest.fn().mockReturnValue('IT개발팀'),
} as unknown as ConfigService<Env, true>;
```

(파일 상단 import에 `import type { ConfigService } from '@nestjs/config';`와 `import type { Env } from '../config/env.schema';` 추가. 기존 `new ReportsService(...)` 호출 전부에 `config` 인자 추가.)

기존 excel 테스트를 다음으로 교체:

```ts
it('builds the company-format excel with korean filename', async () => {
  const repository = new FakeReportsRepository();
  const service = new ReportsService(repository, config);
  const { buffer, fileName, asciiFileName } = await service.excel({
    month: '2026-07',
  });
  expect(fileName).toBe('연장 근무 이력_IT개발팀_2607.xlsx');
  expect(asciiFileName).toBe('overtime-2607.xlsx');
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('연장근무 이력');
  expect(sheet?.getRow(4).getCell(5).value).toBe('김직원');
  expect(sheet?.getRow(4).getCell(4).value).toBe('IT개발팀');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -w apps/api -- --runInBand reports.service.spec.ts`
Expected: FAIL — 생성자 인자 수, excel 반환 타입 불일치

- [ ] **Step 3: 서비스 구현**

`reports.service.ts` 변경:

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import type { Env } from '../config/env.schema';
import { InvalidOvertimeInputError } from '../overtime/domain/overtime.errors';
import { buildReportExcel } from './excel';
import type { ReportExcelRow } from './excel';
import { ReportsRepository } from './reports.repository';
```

```ts
export type ReportExcelResult = {
  buffer: Buffer;
  fileName: string;
  asciiFileName: string;
};
```

```ts
constructor(
  private readonly repository: ReportsRepository,
  private readonly config: ConfigService<Env, true>,
) {}
```

`excel()` 교체:

```ts
async excel(query: MonthlyReportQuery): Promise<ReportExcelResult> {
  const range = this.range(query);
  const records = await this.repository.listRecords(range);
  const department = this.config.get('REPORT_DEPARTMENT', { infer: true });
  const buffer = await buildReportExcel({
    month: query.month,
    department,
    rows: records.map((record) => this.excelRow(record)),
  });
  const yymm = `${query.month.slice(2, 4)}${query.month.slice(5, 7)}`;
  return {
    buffer,
    fileName: `연장 근무 이력_${department}_${yymm}.xlsx`,
    asciiFileName: `overtime-${yymm}.xlsx`,
  };
}

private excelRow(record: {
  workDate: string;
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  reason: string;
  user: { name: string };
}): ReportExcelRow {
  const end = DateTime.fromJSDate(record.endAt).setZone(TIME_ZONE);
  const endTime = end.toFormat('HH:mm');
  const endsAtMidnight = endTime === '00:00';
  return {
    workDate: record.workDate,
    endDate: endsAtMidnight ? record.workDate : end.toFormat('yyyy-MM-dd'),
    name: record.user.name,
    startTime: DateTime.fromJSDate(record.startAt)
      .setZone(TIME_ZONE)
      .toFormat('HH:mm'),
    endTime: endsAtMidnight ? '24:00' : endTime,
    durationMinutes: record.durationMinutes,
    reason: record.reason,
  };
}
```

- [ ] **Step 4: 서비스 테스트 통과 확인**

Run: `npm run test -w apps/api -- --runInBand reports.service.spec.ts`
Expected: PASS

- [ ] **Step 5: 컨트롤러 테스트 갱신**

`reports.controller.spec.ts`의 excel 테스트 교체:

```ts
it('returns an Excel attachment with the company filename', async () => {
  const buffer = Buffer.from('excel workbook');
  const excelMock = jest.fn().mockResolvedValue({
    buffer,
    fileName: '연장 근무 이력_IT개발팀_2607.xlsx',
    asciiFileName: 'overtime-2607.xlsx',
  });
  const reports = { excel: excelMock } as unknown as ReportsService;
  const controller = new ReportsController(reports);
  const setHeaderMock = jest.fn();
  const response = { setHeader: setHeaderMock } as unknown as Response;

  const result = await controller.excel(
    '2026-07',
    '11111111-1111-4111-8111-111111111111',
    response,
  );

  expect(excelMock).toHaveBeenCalledWith({
    month: '2026-07',
    userId: '11111111-1111-4111-8111-111111111111',
  });
  expect(setHeaderMock).toHaveBeenCalledWith(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  expect(setHeaderMock).toHaveBeenCalledWith(
    'Content-Disposition',
    `attachment; filename="overtime-2607.xlsx"; filename*=UTF-8''${encodeURIComponent(
      '연장 근무 이력_IT개발팀_2607.xlsx',
    )}`,
  );
  expect(result).toBeInstanceOf(StreamableFile);
});
```

- [ ] **Step 6: 컨트롤러 구현**

`reports.controller.ts`의 `excel()` 교체:

```ts
@Get('reports.xlsx')
async excel(
  @Query('month') month: string,
  @Query('userId') userId: string | undefined,
  @Res({ passthrough: true }) response: Response,
): Promise<StreamableFile> {
  const query: MonthlyReportQuery = { month, userId };
  const { buffer, fileName, asciiFileName } =
    await this.reports.excel(query);
  response.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  response.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  );
  return new StreamableFile(buffer);
}
```

- [ ] **Step 7: API 워크스페이스 전체 검증**

Run: `npm run test -w apps/api -- --runInBand`
Expected: PASS (SQLite 이관 테스트 등 PostgreSQL 필요 테스트가 로컬에서 실패하면 해당 실패가 이번 변경과 무관한지 실패 목록으로 확인)

Run: `npm run lint -w apps/api && npm run build -w apps/api`
Expected: 성공

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/reports apps/api/src/config
git commit -m "feat(api): serve company-format excel with korean filename

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: e2e 갱신과 전체 검증

**Files:**
- Modify: `apps/api/test/admin-reports.e2e-spec.ts:138-146` (파일명 기대값)

**Interfaces:**
- Consumes: Task 5의 Content-Disposition 형식

- [ ] **Step 1: e2e 기대값 갱신**

`admin-reports.e2e-spec.ts`의 Content-Disposition 검증을 교체 (주변에 시트명 `업무연장 내역`을 검사하는 코드가 있으면 `연장근무 이력`으로 함께 교체):

```ts
.expect(
  'Content-Disposition',
  /attachment; filename="overtime-2607\.xlsx"; filename\*=UTF-8''/,
)
```

- [ ] **Step 2: e2e 실행 (Docker 필요)**

Run: `npm run test:e2e:postgres`
Expected: PASS. Docker가 없으면 그 사실을 보고하고 이 단계를 사람 확인으로 넘긴다 — 통과를 가장하지 않는다.

- [ ] **Step 3: 워크스페이스 전체 검증**

Run: `npm run lint && npm run build`
Expected: 성공

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/admin-reports.e2e-spec.ts
git commit -m "test(api): align e2e with company excel filename

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 수동 검증 (계획 완료 후)

1. `npm run dev`로 로컬 기동, 관리자 로그인 → 월 선택 → [Excel 다운로드]
2. 받은 파일을 실제 Excel에서 열어 기준 파일과 나란히 비교: 시트 3개, 헤더 색/테두리, 틀고정, 노란 L열, K열 수식 재계산 동작
3. 30분 단위 기록이 L열에 0.5로, 집계 시트 합계에 반영되는지 확인
