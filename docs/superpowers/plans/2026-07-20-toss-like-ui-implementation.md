# AIMS Toss-like UI and Excel Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 직원과 관리자 화면을 빠른 등록형 UI로 개편하고, 관리자 보고서를 실제 Excel `.xlsx` 파일로 내려받게 한다.

**Architecture:** 기존 React Query 데이터 흐름과 NestJS 보고서 조회 로직은 유지한다. 웹에는 의존성 없는 SVG 아이콘·아이콘 버튼·네이티브 dialog 기반 공통 UI를 추가하고, 직원 편집기와 삭제 확인을 그 위에 구성한다. API에는 ExcelJS 기반 워크북 생성기를 두고 기존 CSV 엔드포인트를 `.xlsx` 엔드포인트로 교체한다.

**Tech Stack:** React 19, TypeScript 6, React Query, React Router, Vitest, Testing Library, NestJS 11, Jest, ExcelJS, CSS media queries

## Global Constraints

- 기존 인증, 권한, PostgreSQL 스키마와 운영 데이터는 변경하지 않는다.
- 시작 시간과 종료 시간은 `THIRTY_MINUTE_TIME_OPTIONS`의 30분 단위를 유지한다.
- AIMS 표기는 `AIMS+`가 아닌 `AIMS`를 사용한다.
- AIMS 라임은 주요 행동과 선택 상태에만 사용한다.
- 아이콘 기본 크기는 20px, 선 굵기는 2px, 아이콘 단독 버튼 터치 영역은 최소 44px이다.
- 관리자 모바일 화면에는 가로 스크롤을 만들지 않는다.
- Excel 파일명은 `aims-overtime-YYYY-MM.xlsx`, 시트명은 `업무연장 내역`이다.
- 사용자 소유 `apps/coupang-ledger/`는 수정, 스테이징, 커밋하지 않는다.

## File Structure

- `apps/web/src/ui/Icon.tsx`: 선형 SVG 아이콘 이름과 경로를 한곳에서 관리한다.
- `apps/web/src/ui/IconButton.tsx`: 44px 터치 영역과 접근 가능한 이름을 강제한다.
- `apps/web/src/ui/Dialog.tsx`: 포커스 복귀와 Escape 닫기를 제공하는 공통 대화상자다.
- `apps/web/src/ui/Dialog.test.tsx`: 대화상자의 접근성과 키보드 동작을 검증한다.
- `apps/web/src/overtime/OvertimeEditorDialog.tsx`: 등록·수정 폼을 모바일 바텀시트/데스크톱 대화상자로 표시한다.
- `apps/web/src/overtime/OvertimePage.tsx`: 월 합계, 최근 내역, 편집기와 삭제 확인 상태를 조정한다.
- `apps/web/src/overtime/OvertimeList.tsx`: 정돈된 기록 행과 편집·삭제 아이콘 행동을 렌더링한다.
- `apps/web/src/admin/AdminRecords.tsx`: 데스크톱 표와 모바일 카드의 의미 구조를 담당한다.
- `apps/web/src/admin/AdminPage.tsx`: 필터, 요약, Excel 행동과 조회 상태를 조정한다.
- `apps/web/src/admin/excel-download.ts`: 조회 조건을 `.xlsx` URL로 직렬화한다.
- `apps/api/src/reports/excel.ts`: Excel-safe 셀과 워크북 Buffer를 생성한다.
- `apps/api/src/reports/reports.controller.ts`: Excel MIME type과 파일명을 설정한다.
- `apps/api/src/reports/reports.service.ts`: 기존 월별 행을 Excel 생성기에 전달한다.
- `apps/web/src/styles/global.css`: 디자인 토큰, 반응형 직원/관리자 레이아웃, 대화상자 상태를 정의한다.

---

### Task 1: 공통 아이콘, 버튼, 대화상자

**Files:**
- Create: `apps/web/src/ui/Icon.tsx`
- Create: `apps/web/src/ui/IconButton.tsx`
- Create: `apps/web/src/ui/Dialog.tsx`
- Create: `apps/web/src/ui/Dialog.test.tsx`
- Modify: `apps/web/src/styles/global.css`

**Interfaces:**
- Produces: `Icon({ name, size? })`, `IconButton({ label, icon, tone?, ...buttonProps })`, `Dialog({ open, title, onClose, className?, children })`
- Consumes: React DOM native `<dialog>` behavior and the global CSS tokens.

- [ ] **Step 1: Write the failing accessibility and focus tests**

```tsx
it('labels icon-only buttons', () => {
  render(<IconButton label="내역 삭제" icon="trash" />)
  expect(screen.getByRole('button', { name: '내역 삭제' })).toBeInTheDocument()
  expect(screen.getByRole('button')).toHaveClass('icon-button')
})

it('closes with Escape and restores the opener focus', async () => {
  const user = userEvent.setup()
  function Fixture() {
    const [open, setOpen] = useState(false)
    return <><button onClick={() => setOpen(true)}>열기</button><Dialog open={open} title="업무 시간 입력" onClose={() => setOpen(false)}><button>저장</button></Dialog></>
  }
  render(<Fixture />)
  const opener = screen.getByRole('button', { name: '열기' })
  await user.click(opener)
  expect(screen.getByRole('dialog', { name: '업무 시간 입력' })).toBeInTheDocument()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(opener).toHaveFocus()
})
```

- [ ] **Step 2: Run the focused test and verify the missing modules fail**

Run: `npm run test -w apps/web -- --run src/ui/Dialog.test.tsx`

Expected: FAIL because `Dialog`, `Icon`, and `IconButton` do not exist.

- [ ] **Step 3: Implement the SVG and button contracts**

```tsx
export type IconName = 'plus' | 'close' | 'edit' | 'trash' | 'calendar' | 'chevron-down' | 'download' | 'logout' | 'more'

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
    close: <><path d="m6 6 12 12"/><path d="m18 6-12 12"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></>,
    trash: <><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    'chevron-down': <path d="m6 9 6 6 6-6"/>,
    download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}
```

`IconButton` must require a string `label`, set `aria-label={label}`, render `Icon`, and merge `icon-button`, `icon-button--danger` when `tone === 'danger'`, and the supplied `className`.

- [ ] **Step 4: Implement native dialog lifecycle and focus restoration**

`Dialog` renders nothing while closed. While open it renders `<dialog aria-labelledby={titleId}>`, calls `showModal()` when available, focuses the first focusable child, handles the native `cancel` event with `preventDefault()` and `onClose()`, and restores the previously focused `HTMLElement` during cleanup. The close icon button uses the label `닫기`.

- [ ] **Step 5: Add exact shared interaction styles**

```css
:root { --ink:#191f28; --muted:#6b7684; --weak:#8b95a1; --background:#f2f4f6; --surface:#fff; --line:#e5e8eb; --lime:#d8ff45; }
.icon-button { width:44px; height:44px; padding:0; display:grid; place-items:center; border:0; border-radius:12px; color:var(--muted); background:transparent; }
.icon-button:hover { color:var(--ink); background:#f2f4f6; }
.icon-button--danger { color:var(--danger); }
.app-dialog { width:min(560px, calc(100vw - 32px)); max-height:min(88vh, 760px); padding:0; overflow:auto; border:0; border-radius:24px; background:var(--surface); box-shadow:0 24px 80px rgba(0,27,55,.22); }
.app-dialog::backdrop { background:rgba(15,23,31,.48); }
@media (max-width:767px) { .app-dialog { width:100%; max-width:none; max-height:92vh; margin:auto 0 0; border-radius:24px 24px 0 0; } }
```

- [ ] **Step 6: Run tests and lint**

Run: `npm run test -w apps/web -- --run src/ui/Dialog.test.tsx && npm run lint -w apps/web`

Expected: both commands exit 0; dialog and icon tests PASS.

- [ ] **Step 7: Commit the primitives**

```bash
git add apps/web/src/ui apps/web/src/styles/global.css
git commit -m "feat(web): add accessible UI primitives"
```

### Task 2: 직원 빠른 등록 화면

**Files:**
- Create: `apps/web/src/overtime/OvertimeEditorDialog.tsx`
- Modify: `apps/web/src/overtime/OvertimePage.tsx`
- Modify: `apps/web/src/overtime/OvertimeForm.tsx`
- Modify: `apps/web/src/overtime/OvertimeList.tsx`
- Modify: `apps/web/src/overtime/OvertimePage.test.tsx`
- Modify: `apps/web/src/overtime/OvertimeForm.test.tsx`
- Modify: `apps/web/src/styles/global.css`

**Interfaces:**
- Consumes: `Dialog`, `Icon`, `IconButton`, `OvertimeForm`, `OvertimeRecord`.
- Produces: `OvertimeEditorDialog({ open, record, onSaved, onClose })`; `OvertimeList` additionally accepts `onAdd` for its empty state.

- [ ] **Step 1: Replace the editor and delete expectations with failing dialog tests**

```tsx
it('opens registration in a dialog without inserting an inline form', async () => {
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByRole('button', { name: '추가 근무 등록' }))
  expect(screen.getByRole('dialog', { name: '추가 근무 등록' })).toBeInTheDocument()
  expect(screen.getByLabelText('업무 내용')).toBeInTheDocument()
  expect(document.querySelector('.form-surface')).not.toBeInTheDocument()
})

it('asks in a service dialog before deleting', async () => {
  const user = userEvent.setup()
  renderPageWithOneRecord()
  await user.click(await screen.findByRole('button', { name: '배포 대응 내역 삭제' }))
  expect(screen.getByRole('dialog', { name: '내역을 삭제할까요?' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '삭제하기' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the employee test and verify the old inline behavior fails**

Run: `npm run test -w apps/web -- --run src/overtime/OvertimePage.test.tsx`

Expected: FAIL because the old button is `+ 업무 시간 추가`, the form is inline, and deletion uses `window.confirm`.

- [ ] **Step 3: Add the editor dialog composition**

```tsx
export function OvertimeEditorDialog({ open, record, onSaved, onClose }: Props) {
  return <Dialog open={open} title={record ? '추가 근무 수정' : '추가 근무 등록'} onClose={onClose} className="overtime-editor-dialog">
    <OvertimeForm record={record} onSaved={onSaved} onCancel={onClose} />
  </Dialog>
}
```

Remove the duplicated English form eyebrow. Use `저장하기`, `수정하기`, and `취소` copy. Keep the existing API, validation, entered-value retention, 30-minute options, next-day preview, and saving disabled state.

- [ ] **Step 4: Recompose the page and deletion state**

`OvertimePage` keeps `editorOpen`, `editing`, and a new `pendingDelete: OvertimeRecord | null`. The primary button uses a plus icon and the exact label `추가 근무 등록`. Editing opens the same dialog without scrolling. Deletion first opens `Dialog` titled `내역을 삭제할까요?`; `삭제하기` calls the existing DELETE request and `취소` only clears `pendingDelete`.

- [ ] **Step 5: Rebuild each record row with named icon actions**

Each record renders the Korean month/day/weekday block, reason, start–end time, and formatted duration. The edit and delete `IconButton` labels must be `${record.reason} 내역 수정` and `${record.reason} 내역 삭제`; the visible reason remains text so icon names do not replace content.

- [ ] **Step 6: Replace employee layout CSS**

Set `.page-shell` to a compact maximum width, remove `.summary-copy` and dark oversized total rules, use a pale-lime `.monthly-total`, align `.record-card` as `48px minmax(0,1fr) auto`, and fix `.add-record-button` to the mobile safe-area bottom. On desktop place the action in normal flow and center the dialog. Include `padding-bottom: calc(88px + env(safe-area-inset-bottom))` on mobile so records never hide behind the action.

- [ ] **Step 7: Run employee and form tests**

Run: `npm run test -w apps/web -- --run src/overtime/OvertimePage.test.tsx src/overtime/OvertimeForm.test.tsx`

Expected: all existing 30-minute, overnight, error retention tests and new dialog/delete tests PASS.

- [ ] **Step 8: Commit the employee redesign**

```bash
git add apps/web/src/overtime apps/web/src/styles/global.css
git commit -m "feat(web): redesign employee overtime flow"
```

### Task 3: 관리자 반응형 현황 화면

**Files:**
- Create: `apps/web/src/admin/AdminRecords.tsx`
- Modify: `apps/web/src/admin/AdminPage.tsx`
- Modify: `apps/web/src/admin/AdminFilters.tsx`
- Modify: `apps/web/src/admin/AdminSummary.tsx`
- Delete: `apps/web/src/admin/AdminTable.tsx`
- Modify: `apps/web/src/admin/AdminPage.test.tsx`
- Modify: `apps/web/src/styles/global.css`

**Interfaces:**
- Consumes: `AdminReport`, `AdminOvertimeRecord`, `formatMinutes`, and `Icon`.
- Produces: `AdminRecords({ records })`, with one accessible desktop table and one `aria-label="모바일 업무 연장 내역"` card list controlled by media queries.

- [ ] **Step 1: Write failing admin hierarchy and mobile-list tests**

```tsx
expect(await screen.findByRole('heading', { name: '업무 연장 현황' })).toBeInTheDocument()
expect(screen.getByText('등록 건수')).toBeInTheDocument()
expect(screen.getByText('1건')).toBeInTheDocument()
expect(screen.getByRole('table', { name: '업무 연장 내역' })).toBeInTheDocument()
const mobileList = screen.getByLabelText('모바일 업무 연장 내역')
expect(within(mobileList).getByText('배포 대응')).toBeInTheDocument()
```

- [ ] **Step 2: Run the admin test and verify the missing summary and list fail**

Run: `npm run test -w apps/web -- --run src/admin/AdminPage.test.tsx`

Expected: FAIL because the current summary says `기록 인원`, the table has no accessible name, and no mobile list exists.

- [ ] **Step 3: Implement responsive record representations**

`AdminRecords` returns an empty state when no records exist. Otherwise it renders `.admin-records-desktop` containing a table with `<caption className="sr-only">업무 연장 내역</caption>`, and `.admin-records-mobile` containing a `<ul aria-label="모바일 업무 연장 내역">`. Each mobile card shows work date, employee name/email, time including `다음 날`, formatted duration, and reason.

- [ ] **Step 4: Recompose title, filter and summary cards**

`AdminPage` uses a compact title row. `AdminFilters` keeps immediate URL synchronization and aligns month and user fields in one surface. `AdminSummary` calculates `report.records.length` for `등록 건수`, renders total hours, count, and per-user totals in three cards, and removes English `TOTAL EXTENDED` text.

- [ ] **Step 5: Add exact responsive visibility rules**

```css
.admin-records-mobile { display:none; }
.admin-records-desktop { overflow:hidden; border:1px solid var(--line); border-radius:16px; background:var(--surface); }
@media (max-width:767px) {
  .admin-records-desktop { display:none; }
  .admin-records-mobile { display:block; }
  .admin-filters { grid-template-columns:1fr; }
  .admin-mobile-card { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px 14px; padding:18px; border-radius:16px; background:var(--surface); }
}
```

- [ ] **Step 6: Run admin tests and web lint**

Run: `npm run test -w apps/web -- --run src/admin/AdminPage.test.tsx && npm run lint -w apps/web`

Expected: all admin tests PASS and lint exits 0.

- [ ] **Step 7: Commit the admin redesign**

```bash
git add apps/web/src/admin apps/web/src/styles/global.css
git commit -m "feat(web): add responsive admin report UI"
```

### Task 4: 실제 Excel `.xlsx` 다운로드

**Files:**
- Modify: `apps/api/package.json`
- Modify: `package-lock.json`
- Create: `apps/api/src/reports/excel.ts`
- Create: `apps/api/src/reports/excel.spec.ts`
- Delete: `apps/api/src/reports/csv.ts`
- Delete: `apps/api/src/reports/csv.spec.ts`
- Modify: `apps/api/src/reports/reports.service.ts`
- Modify: `apps/api/src/reports/reports.service.spec.ts`
- Modify: `apps/api/src/reports/reports.controller.ts`
- Create: `apps/api/src/reports/reports.controller.spec.ts`
- Create: `apps/web/src/admin/excel-download.ts`
- Create: `apps/web/src/admin/excel-download.test.ts`
- Delete: `apps/web/src/admin/csv-download.ts`
- Delete: `apps/web/src/admin/csv-download.test.ts`
- Modify: `apps/web/src/admin/AdminPage.tsx`
- Modify: `apps/web/src/admin/AdminPage.test.tsx`

**Interfaces:**
- Produces: `buildReportExcel(rows: ReportExcelRow[]): Promise<Buffer>`, `safeExcelText(value: string): string`, `buildExcelUrl(query): string`.
- API route: `GET /api/admin/reports.xlsx?month=YYYY-MM&userId=<optional UUID>` returns Excel MIME type and attachment filename.
- Consumes: the existing `ReportsService.rows()` filtering and the authenticated admin guards.

- [ ] **Step 1: Install ExcelJS in the API workspace**

Run: `npm install exceljs -w apps/api`

Expected: `exceljs` appears in `apps/api/package.json` dependencies and `package-lock.json` changes.

- [ ] **Step 2: Write failing workbook and formula-safety tests**

```ts
it.each(['=1+1', '+cmd', '-2+3', '@SUM(A1:A2)'])('neutralizes formula text %s', (value) => {
  expect(safeExcelText(value)).toBe(`'${value}`);
});

it('creates the Korean report sheet and exact columns', async () => {
  const buffer = await buildReportExcel([{ workDate:'2026-07-13', name:'김직원', email:'worker@aimskr.com', startTime:'18:00', endTime:'20:00', durationMinutes:120, reason:'배포 대응' }]);
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('업무연장 내역');
  expect(sheet?.getRow(1).values).toEqual([undefined, '근무일', '직원 이름', '이메일', '시작 시간', '종료 시간', '추가 근무', '업무 내용']);
  expect(sheet?.getCell('F2').value).toBe('2시간');
})
```

- [ ] **Step 3: Run the Excel tests and verify the module is missing**

Run: `npm run test -w apps/api -- --runInBand src/reports/excel.spec.ts`

Expected: FAIL because `excel.ts` does not exist.

- [ ] **Step 4: Implement workbook generation**

`buildReportExcel` creates one workbook and `업무연장 내역` worksheet, defines the seven requested columns with widths, styles the header with bold dark text and a pale-lime fill, freezes the top row, enables an autofilter, adds sanitized row strings, formats duration with the same hour/minute copy as the UI, and returns `Buffer.from(await workbook.xlsx.writeBuffer())`. It must not write to disk.

- [ ] **Step 5: Replace service and controller CSV contracts**

Rename `ReportsService.csv(query)` to `excel(query): Promise<Buffer>`. Replace `@Get('reports.csv')` with `@Get('reports.xlsx')`, set `Content-Type` to `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, set `Content-Disposition` to `attachment; filename="aims-overtime-${month}.xlsx"`, and return the Buffer. Preserve `SessionGuard` and `AdminGuard` on the controller.

- [ ] **Step 6: Test headers and identical filtering**

Add a controller test with a mocked response `setHeader` function and a mocked service Buffer. Update the service test to call both `monthly(query)` and `excel(query)`, load the Buffer using ExcelJS, and assert the selected employee is present and the other employee is absent.

- [ ] **Step 7: Replace the frontend URL and button**

```ts
export function buildExcelUrl(query: { month: string; userId?: string }): string {
  const params = new URLSearchParams({ month: query.month })
  if (query.userId) params.set('userId', query.userId)
  return `/api/admin/reports.xlsx?${params.toString()}`
}
```

The admin link uses the download icon, exact text `Excel 다운로드`, and `href={buildExcelUrl({ month, userId })}`. Update the AdminPage expectation to `/api/admin/reports.xlsx?month=2026-07&userId=user-1`.

- [ ] **Step 8: Run API and web report tests**

Run: `npm run test -w apps/api -- --runInBand src/reports && npm run test -w apps/web -- --run src/admin`

Expected: Excel generator, controller, service, URL, and admin component tests PASS; no CSV test remains.

- [ ] **Step 9: Commit the Excel export**

```bash
git add apps/api/package.json package-lock.json apps/api/src/reports apps/web/src/admin
git commit -m "feat: export admin reports as Excel workbooks"
```

### Task 5: 헤더, 상태, 전체 회귀 검증

**Files:**
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/styles/global.css`
- Modify: `docs/plans/2026-07-20-toss-like-ui-design.md` only if verified implementation differs from an approved detail.

**Interfaces:**
- Consumes: `Icon`, the employee page, admin page, shared color and focus tokens.
- Produces: a consistent AIMS header, skeleton/loading states, final production-ready build.

- [ ] **Step 1: Write failing header interaction expectations**

```tsx
expect(screen.getByRole('link', { name: 'AIMS' })).toHaveAttribute('href', '/')
expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument()
expect(screen.getByTestId('logout-icon')).toBeInTheDocument()
```

Expose `data-testid="logout-icon"` on the SVG only in this named header case, while retaining the visible `로그아웃` text on desktop and the button accessible name on mobile.

- [ ] **Step 2: Run App tests and verify the icon expectation fails**

Run: `npm run test -w apps/web -- --run src/App.test.tsx`

Expected: existing routing tests PASS and the new logout icon expectation FAILS.

- [ ] **Step 3: Polish the protected header and states**

Use a white compact header, AIMS wordmark, neutral user information, and logout icon. Keep the administrator redirect and navigation behavior unchanged. Replace layout-shifting text loading cards with fixed-height skeleton blocks carrying `aria-label="불러오는 중"`; errors retain their retry button and `role="alert"`.

- [ ] **Step 4: Run the complete verification suite**

Run: `npm test`

Expected: API Jest and web Vitest suites both exit 0.

Run: `npm run lint`

Expected: API ESLint and web oxlint both exit 0 without modifying unrelated files.

Run: `npm run build`

Expected: Nest API and Vite web production builds both exit 0.

- [ ] **Step 5: Inspect repository scope**

Run: `git status --short && git diff --stat HEAD~4..HEAD`

Expected: `apps/coupang-ledger/` remains untracked and absent from every commit; only approved web, reports, dependency, and documentation paths appear.

- [ ] **Step 6: Commit final integration polish**

```bash
git add apps/web/src/app/router.tsx apps/web/src/App.test.tsx apps/web/src/styles/global.css
git commit -m "feat(web): polish AIMS navigation and loading states"
```

- [ ] **Step 7: Perform visual verification at both breakpoints**

Run: `npm run dev`

Expected: employee screens at 390px and 1280px have no overlap, the mobile action respects the safe area, employee dialogs open and close without page movement, admin mobile has no horizontal scrollbar, admin desktop columns align, and the Excel link downloads an `.xlsx` workbook with the selected filters.

