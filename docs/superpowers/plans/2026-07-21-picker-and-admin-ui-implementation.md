# 날짜·월 선택기 및 관리자 이름 UI 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 추가 근무 날짜 선택과 관리자 조회 월을 일관된 커스텀 선택기로 제공하고, 시간 화살표와 관리자 직원 이름의 시각적 정렬·계층을 바로잡는다.

**Architecture:** 공통 UI 경계에 `DatePicker`를 새로 만들고 기존 `MonthPicker`는 관리자 필터에서도 재사용한다. 폼과 관리자 컴포넌트는 선택기가 전달하는 기존 `YYYY-MM-DD`·`YYYY-MM` 문자열만 소비하므로 API와 데이터 계층은 변경하지 않는다. 스타일은 공통 선택기 규칙과 화면별 범위 클래스로 나눠 모바일 오버플로를 차단한다.

**Tech Stack:** React 19, TypeScript 6, Vitest, Testing Library, Vite, 기존 CSS, Docker Compose

## Global Constraints

- API, PostgreSQL 스키마, 운영 데이터는 변경하지 않는다.
- 새 외부 패키지를 추가하지 않는다.
- 날짜 폼 값은 `YYYY-MM-DD`, 관리자 조회 월은 `YYYY-MM`을 유지한다.
- 날짜·월 트리거와 팝오버는 320px 이상 모바일 화면과 PC에서 컨테이너를 넘지 않아야 한다.
- 직원 이름은 집계·데스크톱 표·모바일 카드에서 15px 굵은 본문으로 표시한다.
- 배포 전 PostgreSQL 백업을 만들고 웹 컨테이너만 다시 빌드·기동한다.

---

### Task 1: 공통 날짜 선택기

**Files:**
- Create: `apps/web/src/ui/DatePicker.tsx`
- Create: `apps/web/src/ui/DatePicker.test.tsx`
- Modify: `apps/web/src/styles/global.css`

**Interfaces:**
- Consumes: `Icon`의 `calendar`, `chevron-left`, `chevron-right`
- Produces: `DatePicker({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void })`

- [ ] **Step 1: 날짜 선택기의 실패 테스트 작성**

```tsx
it('opens on the selected month and emits a YYYY-MM-DD date', async () => {
  const onChange = vi.fn()
  const user = userEvent.setup()
  render(<DatePicker label="근무 날짜" value="2026-07-13" onChange={onChange} />)

  expect(screen.getByRole('button', { name: '근무 날짜' }))
    .toHaveTextContent('2026년 7월 13일')
  await user.click(screen.getByRole('button', { name: '근무 날짜' }))
  expect(screen.getByRole('dialog', { name: '근무 날짜 선택' }))
    .toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '2026년 7월 21일 선택' }))
  expect(onChange).toHaveBeenCalledWith('2026-07-21')
})

it('moves between months and closes on Escape', async () => {
  const user = userEvent.setup()
  render(<DatePicker label="근무 날짜" value="2026-07-13" onChange={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: '근무 날짜' }))
  await user.click(screen.getByRole('button', { name: '다음 달' }))
  expect(screen.getByText('2026년 8월')).toBeInTheDocument()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog', { name: '근무 날짜 선택' }))
    .not.toBeInTheDocument()
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test --workspace apps/web -- DatePicker.test.tsx --run`

Expected: FAIL because `DatePicker.tsx` does not exist.

- [ ] **Step 3: 최소 날짜 선택기 구현**

`DatePicker.tsx`는 유효한 `YYYY-MM-DD`를 연·월·일로 파싱하고 `viewDate` 상태로 현재 달을 관리한다. 선택 달의 첫날 앞 빈 칸과 마지막 날까지 포함한 날짜 버튼을 만들고 선택 시 아래 형식으로 전달한다.

```tsx
type DatePickerProps = {
  label: string
  value: string
  onChange: (value: string) => void
}

const formatValue = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

export function DatePicker({ label, value, onChange }: DatePickerProps) {
  // MonthPicker와 같은 바깥 클릭·Escape 닫기 수명주기를 사용한다.
  // trigger: `${year}년 ${month}월 ${day}일`
  // dialog: `${label} 선택`
  // day aria-label: `${viewYear}년 ${viewMonth}월 ${day}일 선택`
}
```

CSS는 `.date-picker`, `.date-picker-trigger`, `.date-picker-popover`, `.date-picker-header`, `.date-picker-weekdays`, `.date-picker-grid`로 분리한다. 트리거는 48px 높이와 100% 너비, 팝오버는 `width: min(320px, 100%)`, `left: 0`, 날짜 그리드는 7열을 사용한다.

- [ ] **Step 4: 컴포넌트 테스트 통과 확인**

Run: `npm test --workspace apps/web -- DatePicker.test.tsx --run`

Expected: 2 tests PASS.

- [ ] **Step 5: 날짜 선택기 커밋**

```bash
git add apps/web/src/ui/DatePicker.tsx apps/web/src/ui/DatePicker.test.tsx apps/web/src/styles/global.css
git commit -m "feat(web): add accessible work date picker"
```

### Task 2: 추가 근무 폼과 시간 화살표

**Files:**
- Modify: `apps/web/src/overtime/OvertimeForm.tsx`
- Modify: `apps/web/src/overtime/OvertimeForm.test.tsx`
- Modify: `apps/web/src/styles/global.css`

**Interfaces:**
- Consumes: `DatePicker`, `Icon name="chevron-right"`
- Produces: 기존 `OvertimeFormValues.workDate`에 `YYYY-MM-DD`를 유지하는 폼

- [ ] **Step 1: 폼 통합과 SVG 화살표의 실패 테스트 작성**

기존 네이티브 날짜 input 테스트를 다음 동작 테스트로 교체한다.

```tsx
it('uses the custom work date picker and submits its date', async () => {
  let submittedBody: unknown
  server.use(http.post('/api/overtime', async ({ request }) => {
    submittedBody = await request.json()
    return HttpResponse.json(record)
  }))
  const user = userEvent.setup()
  render(<OvertimeForm onSaved={vi.fn()} />)

  expect(document.querySelector('input[type="date"]')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '근무 날짜' }))
  await user.click(screen.getByRole('button', { name: '2026년 7월 13일 선택' }))
  await user.type(screen.getByLabelText('업무 내용'), '배포 대응')
  await user.click(screen.getByRole('button', { name: '저장하기' }))
  expect(submittedBody).toMatchObject({ workDate: '2026-07-13' })
})

it('uses a centered svg icon between the time fields', () => {
  const { container } = render(<OvertimeForm onSaved={vi.fn()} />)
  const arrow = container.querySelector('.time-arrow')
  expect(arrow?.querySelector('svg')).toBeInTheDocument()
  expect(arrow).not.toHaveTextContent('→')
  expect(globalStyles).toMatch(/\.time-arrow \{[^}]*height: 48px;[^}]*place-items: center;[^}]*line-height: 0;/)
})
```

테스트 날짜는 고정 `record`를 편집 모드로 렌더링해 시스템 날짜에 의존하지 않도록 조정한다.

- [ ] **Step 2: 실패 확인**

Run: `npm test --workspace apps/web -- OvertimeForm.test.tsx --run`

Expected: FAIL because the native input and text arrow still render.

- [ ] **Step 3: 폼을 DatePicker와 SVG 아이콘으로 교체**

```tsx
<div className="field field-wide">
  <span>근무 날짜</span>
  <DatePicker
    label="근무 날짜"
    value={values.workDate}
    onChange={(value) => update('workDate', value)}
  />
</div>

<span className="time-arrow" aria-hidden="true">
  <Icon name="chevron-right" size={18} />
</span>
```

`.work-date-input`은 삭제한다. `.time-arrow`에는 `align-self: end`, `line-height: 0`을 추가하고 SVG를 block으로 만든다. 359px 이하에서는 `width: 100%`, `height: 18px`, `align-self: center`, `rotate(90deg)`를 적용한다.

- [ ] **Step 4: 폼 테스트 통과 확인**

Run: `npm test --workspace apps/web -- OvertimeForm.test.tsx --run`

Expected: all OvertimeForm tests PASS.

- [ ] **Step 5: 폼 통합 커밋**

```bash
git add apps/web/src/overtime/OvertimeForm.tsx apps/web/src/overtime/OvertimeForm.test.tsx apps/web/src/styles/global.css
git commit -m "fix(web): align work date and time controls"
```

### Task 3: 관리자 월 선택기와 직원 이름 계층

**Files:**
- Modify: `apps/web/src/admin/AdminFilters.tsx`
- Modify: `apps/web/src/admin/AdminPage.test.tsx`
- Modify: `apps/web/src/admin/AdminSummary.tsx`
- Modify: `apps/web/src/admin/AdminRecords.tsx`
- Modify: `apps/web/src/styles/global.css`

**Interfaces:**
- Consumes: `MonthPicker({ label, value, onChange })`
- Produces: 기존 `AdminFilters.onChange({ month, userId })` 계약을 유지하는 관리자 필터

- [ ] **Step 1: 관리자 월 선택과 이름 스타일 실패 테스트 작성**

```tsx
it('changes the report month with the shared month picker', async () => {
  const user = userEvent.setup()
  renderPage('/admin?month=2026-07')
  await user.click(await screen.findByRole('button', { name: '조회 월' }))
  await user.click(screen.getByRole('button', { name: '2026년 6월 선택' }))
  expect(window.location.search).toContain('month=2026-06')
})

it('uses readable employee name hierarchy in every admin view', () => {
  expect(globalStyles).toMatch(/\.person-name[^}]*font-size: 15px;[^}]*font-weight: 800;/)
  expect(globalStyles).toMatch(/\.admin-person-name[^}]*font-size: 15px;[^}]*font-weight: 800;/)
})
```

기존 `fireEvent.change(screen.getByLabelText('조회 월'))` 테스트는 월 선택 버튼 클릭 방식으로 바꾼다.

- [ ] **Step 2: 실패 확인**

Run: `npm test --workspace apps/web -- AdminPage.test.tsx --run`

Expected: FAIL because the admin filter still uses a native month input and name classes do not exist.

- [ ] **Step 3: 관리자 필터와 이름 마크업 구현**

```tsx
<div className="field admin-month-field">
  <span>조회 월</span>
  <MonthPicker
    label="조회 월"
    value={month}
    onChange={(nextMonth) => onChange({ month: nextMonth, userId })}
  />
</div>
```

집계 이름에는 `person-name`, 데스크톱·모바일 기록 이름에는 `admin-person-name`을 부여한다. 두 클래스는 15px/800으로 통일하고 `.person-totals li`와 이름 영역에는 `min-width: 0` 및 `overflow-wrap: anywhere`를 적용한다. `.admin-month-field .month-picker`와 trigger는 100% 너비를 사용하며 데스크톱 필터의 팝오버는 왼쪽에 정렬한다.

- [ ] **Step 4: 관리자 테스트 통과 확인**

Run: `npm test --workspace apps/web -- AdminPage.test.tsx --run`

Expected: all AdminPage tests PASS.

- [ ] **Step 5: 관리자 UI 커밋**

```bash
git add apps/web/src/admin/AdminFilters.tsx apps/web/src/admin/AdminPage.test.tsx apps/web/src/admin/AdminSummary.tsx apps/web/src/admin/AdminRecords.tsx apps/web/src/styles/global.css
git commit -m "fix(web): unify admin month and employee styles"
```

### Task 4: 전체 회귀 및 실제 화면 검증

**Files:**
- Modify only if a verification failure identifies a scoped defect in files from Tasks 1–3.

**Interfaces:**
- Consumes: completed DatePicker, OvertimeForm, AdminFilters and admin typography
- Produces: verified production build artifact

- [ ] **Step 1: 정적·단위 검증 실행**

Run:

```bash
npm test --workspace apps/web -- --run
npm run lint --workspace apps/web
npm run build --workspace apps/web
git diff --check
```

Expected: all tests PASS, lint exits 0, build exits 0, diff check has no output.

- [ ] **Step 2: 모바일·PC 브라우저 실측**

로컬 Vite 화면에서 추가 근무 모달과 관리자 화면을 각각 320px, 360px, 390px, 430px, 1280px로 확인한다.

- 날짜와 관리자 월 trigger의 `right <= parent.right`
- 열린 popover의 `left >= viewport.left`, `right <= viewport.right`
- 360px 이상에서 `.time-arrow` 중심 Y가 시작·종료 select 중심 Y와 1px 이내
- 359px 이하에서 화살표가 두 select 사이에 위치
- 집계·표·모바일 카드 이름의 computed font-size가 `15px`
- `document.documentElement.scrollWidth === document.documentElement.clientWidth`

- [ ] **Step 3: 회귀 수정이 있었다면 관련 테스트와 전체 검증 재실행**

Expected: Step 1과 Step 2의 모든 조건 충족.

- [ ] **Step 4: 검증 수정 커밋**

검증 중 코드 변경이 있을 때만 명시적 파일을 스테이징하고 `fix(web): contain picker layouts across viewports`로 커밋한다.

### Task 5: 운영 백업 및 웹 전용 배포

**Files:**
- No repository source changes expected.

**Interfaces:**
- Consumes: `/opt/overtime/.env.backup`, `compose.production.yaml`, built web source
- Produces: `https://aims-overtime.duckdns.org`의 새 웹 배포

- [ ] **Step 1: 운영 PostgreSQL 백업 생성**

Run on server from `/opt/overtime` after loading `.env.backup`:

```bash
./docker/postgres-backup.sh
```

Expected: a new timestamped dump under `/data/overtime/postgres-backups` and exit 0.

- [ ] **Step 2: 소스 동기화**

`apps/coupang-ledger/`, `.env*`, 빌드 산출물, DB 데이터, `.git/`을 제외하고 저장소를 `/opt/overtime/`로 rsync한다.

Expected: only application source and deployment definitions are transferred.

- [ ] **Step 3: 웹 컨테이너만 재빌드·기동**

```bash
docker compose --env-file .env.production -f compose.production.yaml build web
docker compose --env-file .env.production -f compose.production.yaml up -d --no-deps web
```

Expected: web container is healthy; API and PostgreSQL containers are not recreated.

- [ ] **Step 4: 운영 검증**

- `https://aims-overtime.duckdns.org` returns 200.
- 새 JS/CSS asset returns 200.
- API health endpoint is healthy.
- PostgreSQL `users` and `overtime_records` counts match pre-deploy counts.

- [ ] **Step 5: main 푸시**

```bash
git push origin main
```

Expected: remote `main` contains all implementation commits.
