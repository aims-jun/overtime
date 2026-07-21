# 관리자 요약 및 폼 컨트롤 정렬 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시간 입력과 두 화살표를 48px 입력 영역 중심에 정렬하고, 관리자 직원별 합계를 상위 3명과 전체 펼치기 형태로 개선한다.

**Architecture:** 기존 API와 폼 값 계약은 유지하고 표시 컴포넌트만 수정한다. `OvertimeForm`과 `AdminFilters`는 명시적 48px 컨트롤 래퍼로 브라우저별 렌더링 차이를 제거하고, `AdminSummary`는 보고서 배열의 안정 정렬과 로컬 펼침 상태만 담당한다.

**Tech Stack:** React 19, TypeScript 6, Vitest, Testing Library, Vite, 기존 CSS, Docker Compose

## Global Constraints

- API, PostgreSQL 스키마, 보고서 요청 형식과 운영 데이터는 변경하지 않는다.
- 새 외부 패키지를 추가하지 않는다.
- 시작 시간과 종료 시간 값 및 30분 단위 옵션을 유지한다.
- 직원 선택기의 네이티브 선택 동작과 `onChange({ month, userId })` 계약을 유지한다.
- 직원별 합계는 `totalMinutes` 내림차순이며 동률이면 API 응답 순서를 유지한다.
- 기본 상태는 상위 3명, 펼친 상태는 최대 10명이다.
- 배포 전 PostgreSQL 백업을 생성하고 웹 컨테이너만 재빌드·기동한다.
- `apps/coupang-ledger/`는 수정, 스테이징, 배포하지 않는다.

---

### Task 1: 시간 입력과 화살표를 동일한 48px 영역에 고정

**Files:**
- Modify: `apps/web/src/overtime/OvertimeForm.test.tsx`
- Modify: `apps/web/src/styles/global.css`

**Interfaces:**
- Consumes: 기존 `.time-fields`, `.time-arrow`, 시작·종료 네이티브 `select`
- Produces: 시작 `select`, 화살표 슬롯, 종료 `select`가 모두 실제 높이 48px인 시간 행

- [ ] **Step 1: 시간 컨트롤 높이 회귀 테스트 작성**

기존 `uses a centered svg icon between the time fields`의 CSS 기대값을 다음처럼 바꾼다.

```tsx
expect(globalStyles).toMatch(
  /\.time-arrow \{[^}]*display: grid;[^}]*place-items: center;[^}]*line-height: 0;/,
)
```

그 뒤 다음 테스트를 추가하고, 359px 이하 회귀 테스트의 `height: 18px` 기대값을 `height: 48px`로 바꾼다.

```tsx
it('keeps both time inputs and the arrow in identical 48px slots', () => {
  expect(globalStyles).toMatch(
    /\.time-fields select,\s*\.time-arrow \{ height: 48px; \}/,
  )
  expect(globalStyles).toMatch(
    /\.time-arrow \{[^}]*display: grid;[^}]*place-items: center;[^}]*align-self: end;/,
  )
})

it('rotates only the arrow icon when time fields stack', () => {
  expect(globalStyles).toMatch(
    /@media \(max-width: 359px\) \{[\s\S]*\.time-arrow \{[^}]*width: 100%;[^}]*height: 48px;[^}]*\}[\s\S]*\.time-arrow svg \{ transform: rotate\(90deg\); \}/,
  )
  expect(globalStyles).not.toMatch(
    /@media \(max-width: 359px\) \{[\s\S]*\.time-arrow \{[^}]*transform:/,
  )
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test --workspace apps/web -- OvertimeForm.test.tsx --run`

Expected: FAIL because time selects have only `min-height`, no shared 48px height rule exists, and the stacked arrow is 18px tall.

- [ ] **Step 3: 시간 입력과 화살표 높이 규칙 구현**

`global.css`의 시간 필드 규칙을 다음 형태로 바꾼다.

```css
.time-fields { display: grid; grid-template-columns: minmax(0, 1fr) 28px minmax(0, 1fr); align-items: end; gap: 12px; }
.time-fields select,
.time-arrow { height: 48px; }
.time-arrow { display: grid; place-items: center; align-self: end; line-height: 0; color: #899087; }
.time-arrow svg { display: block; }
```

359px 이하 규칙은 슬롯 높이를 유지하고 SVG만 회전한다.

```css
.time-arrow { width: 100%; height: 48px; align-self: center; }
.time-arrow svg { transform: rotate(90deg); }
```

- [ ] **Step 4: 대상 테스트 통과 확인**

Run: `npm test --workspace apps/web -- OvertimeForm.test.tsx --run`

Expected: all `OvertimeForm` tests PASS.

- [ ] **Step 5: 시간 정렬 커밋**

```bash
git add apps/web/src/overtime/OvertimeForm.test.tsx apps/web/src/styles/global.css
git commit -m "fix(web): align arrow with time inputs"
```

### Task 2: 직원 드롭다운 커스텀 화살표

**Files:**
- Create: `apps/web/src/admin/AdminFilters.test.tsx`
- Modify: `apps/web/src/admin/AdminFilters.tsx`
- Modify: `apps/web/src/styles/global.css`

**Interfaces:**
- Consumes: `Icon name="chevron-down"`, 기존 `AdminFilters` props와 native `select`
- Produces: `.admin-select-control` 안에서 48px 선택기 중심에 배치된 장식 SVG

- [ ] **Step 1: 드롭다운 화살표 실패 테스트 작성**

```tsx
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { AdminFilters } from './AdminFilters'

const globalStyles = readFileSync('src/styles/global.css', 'utf8')

describe('AdminFilters', () => {
  it('uses a centered service icon instead of the browser select arrow', () => {
    const { container } = render(
      <AdminFilters
        month="2026-07"
        users={[{ id: 'user-1', name: '조영래', email: 'yrcho@aimskr.com' }]}
        onChange={vi.fn()}
      />,
    )

    const select = screen.getByLabelText('직원')
    const control = select.closest('.admin-select-control')

    expect(control).not.toBeNull()
    expect(control?.querySelector('svg')).toBeInTheDocument()
    expect(globalStyles).toMatch(
      /\.admin-select-control select \{[^}]*padding-right: 46px;[^}]*appearance: none;/,
    )
    expect(globalStyles).toMatch(
      /\.admin-select-control > svg \{[^}]*top: 50%;[^}]*right: 15px;[^}]*transform: translateY\(-50%\);[^}]*pointer-events: none;/,
    )
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test --workspace apps/web -- AdminFilters.test.tsx --run`

Expected: FAIL because `.admin-select-control` and its SVG do not exist.

- [ ] **Step 3: 직원 select 래퍼와 아이콘 구현**

`AdminFilters.tsx`에 `Icon`을 import하고 직원 필터를 다음 구조로 바꾼다.

```tsx
import { Icon } from '../ui/Icon'

<label className="field">
  <span>직원</span>
  <div className="admin-select-control">
    <select
      value={userId ?? ''}
      onChange={(event) =>
        onChange({ month, userId: event.target.value || undefined })
      }
    >
      <option value="">전체 직원</option>
      {users.map((user) => (
        <option key={user.id} value={user.id}>
          {user.name} · {user.email}
        </option>
      ))}
    </select>
    <Icon name="chevron-down" size={18} />
  </div>
</label>
```

`global.css`에 다음 규칙을 추가한다.

```css
.admin-select-control { width: 100%; height: 48px; position: relative; }
.admin-select-control select {
  height: 48px;
  padding-right: 46px;
  appearance: none;
  -webkit-appearance: none;
}
.admin-select-control > svg {
  position: absolute;
  top: 50%;
  right: 15px;
  transform: translateY(-50%);
  pointer-events: none;
  color: #5f695f;
}
```

- [ ] **Step 4: 대상 테스트와 기존 관리자 테스트 통과 확인**

Run:

```bash
npm test --workspace apps/web -- AdminFilters.test.tsx AdminPage.test.tsx --run
```

Expected: both test files PASS, and the existing employee filter behavior remains intact.

- [ ] **Step 5: 직원 드롭다운 커밋**

```bash
git add apps/web/src/admin/AdminFilters.tsx apps/web/src/admin/AdminFilters.test.tsx apps/web/src/styles/global.css
git commit -m "fix(web): center admin select chevron"
```

### Task 3: 상위 3명과 전체 펼치기 요약

**Files:**
- Create: `apps/web/src/admin/AdminSummary.test.tsx`
- Modify: `apps/web/src/admin/AdminSummary.tsx`
- Modify: `apps/web/src/styles/global.css`

**Interfaces:**
- Consumes: `AdminReport.totalsByUser: Array<{ user: AdminUser; totalMinutes: number }>`
- Produces: 안정 정렬된 `ol`, 기본 상위 3명, `전체 N명 보기`/`접기` 버튼

- [ ] **Step 1: 상위 3명과 펼치기 실패 테스트 작성**

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { AdminReport } from '../api/types'
import { AdminSummary } from './AdminSummary'

const report: AdminReport = {
  month: '2026-07',
  totalMinutes: 540,
  records: [],
  totalsByUser: [
    { user: { id: 'u1', name: '첫째', email: '1@aimskr.com' }, totalMinutes: 60 },
    { user: { id: 'u2', name: '둘째', email: '2@aimskr.com' }, totalMinutes: 180 },
    { user: { id: 'u3', name: '셋째', email: '3@aimskr.com' }, totalMinutes: 120 },
    { user: { id: 'u4', name: '넷째', email: '4@aimskr.com' }, totalMinutes: 90 },
    { user: { id: 'u5', name: '다섯째', email: '5@aimskr.com' }, totalMinutes: 90 },
  ],
}

describe('AdminSummary', () => {
  it('shows the stable top three and expands the full employee list', async () => {
    const user = userEvent.setup()
    render(<AdminSummary report={report} />)

    const list = screen.getByRole('list', { name: '직원별 업무 연장 합계' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    expect(within(list).getAllByText(/째$/).map((node) => node.textContent))
      .toEqual(['둘째', '셋째', '넷째'])
    expect(screen.queryByText('다섯째')).not.toBeInTheDocument()

    const expand = screen.getByRole('button', { name: '전체 5명 보기' })
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    await user.click(expand)

    expect(within(list).getAllByRole('listitem')).toHaveLength(5)
    expect(within(list).getAllByText(/째$/).map((node) => node.textContent))
      .toEqual(['둘째', '셋째', '넷째', '다섯째', '첫째'])
    expect(screen.getByRole('button', { name: '접기' }))
      .toHaveAttribute('aria-expanded', 'true')

    await user.click(screen.getByRole('button', { name: '접기' }))
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
  })
})
```

- [ ] **Step 2: 소수 인원과 빈 상태 실패 테스트 추가**

```tsx
it('omits the toggle for three or fewer employees', () => {
  render(
    <AdminSummary report={{ ...report, totalsByUser: report.totalsByUser.slice(0, 3) }} />,
  )

  expect(screen.queryByRole('button', { name: /전체 .*명 보기/ }))
    .not.toBeInTheDocument()
})

it('shows an explicit empty employee summary', () => {
  render(<AdminSummary report={{ ...report, totalsByUser: [] }} />)

  expect(screen.getByText('집계된 직원이 없습니다')).toBeInTheDocument()
  expect(screen.queryByRole('list', { name: '직원별 업무 연장 합계' }))
    .not.toBeInTheDocument()
})
```

- [ ] **Step 3: 실패 확인**

Run: `npm test --workspace apps/web -- AdminSummary.test.tsx --run`

Expected: FAIL because all employees are rendered without ranking, toggle, or empty state.

- [ ] **Step 4: 안정 정렬과 펼침 상태 구현**

`AdminSummary.tsx`를 다음 구조로 구현한다.

```tsx
import { useId, useMemo, useState } from 'react'
import type { AdminReport } from '../api/types'
import { formatMinutes } from '../overtime/time-preview'

export function AdminSummary({ report }: { report: AdminReport }) {
  const [expanded, setExpanded] = useState(false)
  const listId = useId()
  const rankedTotals = useMemo(
    () => report.totalsByUser
      .map((total, index) => ({ total, index }))
      .sort((left, right) =>
        right.total.totalMinutes - left.total.totalMinutes ||
        left.index - right.index,
      )
      .map(({ total }) => total)
      .slice(0, 10),
    [report.totalsByUser],
  )
  const visibleTotals = expanded ? rankedTotals : rankedTotals.slice(0, 3)

  return (
    <section className="admin-summary" aria-label="업무 연장 집계">
      <div className="summary-total" aria-label="전체 업무 연장 합계">
        <span>전체 업무 연장</span>
        <strong>{formatMinutes(report.totalMinutes)}</strong>
      </div>
      <div className="summary-count">
        <span>등록 건수</span>
        <strong>{report.records.length}건</strong>
      </div>
      <div className="summary-people">
        <div className="summary-people-header">
          <span>직원별 합계</span>
          <strong>{rankedTotals.length}명</strong>
        </div>
        {rankedTotals.length === 0 ? (
          <p className="person-totals-empty">집계된 직원이 없습니다</p>
        ) : (
          <>
            <ol id={listId} className="person-totals" aria-label="직원별 업무 연장 합계">
              {visibleTotals.map(({ user, totalMinutes }, index) => (
                <li key={user.id}>
                  <span className="person-rank" aria-hidden="true">{index + 1}</span>
                  <span className="person-name">{user.name}</span>
                  <strong>{formatMinutes(totalMinutes)}</strong>
                </li>
              ))}
            </ol>
            {rankedTotals.length > 3 ? (
              <button
                className="person-totals-toggle"
                type="button"
                aria-controls={listId}
                aria-expanded={expanded}
                onClick={() => setExpanded((current) => !current)}
              >
                {expanded ? '접기' : `전체 ${rankedTotals.length}명 보기`}
              </button>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 5: 요약 레이아웃과 목록 스타일 구현**

`global.css`에서 관리자 요약을 두 숫자 영역과 전체 너비 직원 영역으로 바꾸고 다음 스타일을 적용한다.

```css
.admin-summary { grid-template-columns: 1.2fr .8fr; }
.summary-people { grid-column: 1 / -1; }
.summary-people-header { margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.summary-people-header span { color: var(--muted); font-size: 12px; }
.summary-people-header strong { color: var(--muted); font-size: 12px; letter-spacing: 0; }
.person-totals { margin: 0; padding: 0; list-style: none; }
.person-totals li {
  min-width: 0;
  padding: 10px 0;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  border-top: 1px solid var(--line);
}
.person-rank { width: 22px; height: 22px; display: grid; place-items: center; border-radius: 7px; color: #596259; background: #eef0ea; font-size: 11px; font-weight: 850; }
.person-name { min-width: 0; overflow-wrap: anywhere; font-size: 15px; font-weight: 800; }
.person-totals li strong { white-space: nowrap; font-size: 14px; }
.person-totals-toggle { width: 100%; min-height: 40px; margin-top: 8px; border: 0; border-radius: 10px; color: #435043; background: #eef0ea; font-weight: 800; }
.person-totals-toggle:hover { background: #e3e7df; }
.person-totals-empty { margin: 0; padding: 16px 0 4px; color: var(--muted); font-size: 13px; }
```

기존 `.person-totals li + li`, flex 전용 규칙과 세 번째 열을 전제로 한 `grid-template-columns: 1.2fr .8fr 2fr`은 제거한다. 모바일의 `.summary-people { grid-column: 1 / -1; }` 계약은 유지한다.

- [ ] **Step 6: 대상 테스트와 관리자 페이지 회귀 확인**

Run:

```bash
npm test --workspace apps/web -- AdminSummary.test.tsx AdminPage.test.tsx --run
```

Expected: all AdminSummary and AdminPage tests PASS.

- [ ] **Step 7: 직원 요약 커밋**

```bash
git add apps/web/src/admin/AdminSummary.tsx apps/web/src/admin/AdminSummary.test.tsx apps/web/src/styles/global.css
git commit -m "feat(web): add expandable employee rankings"
```

### Task 4: 전체 회귀와 실제 화면 실측

**Files:**
- Modify only if verification finds a scoped defect in files from Tasks 1–3.

**Interfaces:**
- Consumes: 48px time row, custom admin select icon, expandable ranked summary
- Produces: verified responsive production build

- [ ] **Step 1: 전체 정적 검증 실행**

Run:

```bash
npm test --workspace apps/web -- --run
npm run lint --workspace apps/web
npm run build --workspace apps/web
git diff --check
```

Expected: all tests PASS, lint and build exit 0, diff check has no output.

- [ ] **Step 2: 로컬 브라우저 실측 화면 준비**

임시 `apps/web/visual-preview.html`은 `/src/visual-preview.tsx`를 로드한다.

```html
<!doctype html>
<html lang="ko">
  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
  <body><div id="root"></div><script type="module" src="/src/visual-preview.tsx"></script></body>
</html>
```

`apps/web/src/visual-preview.tsx`에는 다음 검증 화면을 만든다.

```tsx
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AdminFilters } from './admin/AdminFilters'
import { AdminSummary } from './admin/AdminSummary'
import { OvertimeForm } from './overtime/OvertimeForm'
import './styles/global.css'

const users = Array.from({ length: 5 }, (_, index) => ({
  id: `u${index + 1}`,
  name: index === 4 ? '매우 긴 이름을 가진 직원 테스트' : `직원 ${index + 1}`,
  email: `${index + 1}@aimskr.com`,
}))

function Preview() {
  const [filters, setFilters] = useState<{ month: string; userId?: string }>({ month: '2026-07' })
  return (
    <main className="admin-page">
      <div className="overtime-editor-dialog"><OvertimeForm onSaved={() => undefined} /></div>
      <AdminFilters month={filters.month} userId={filters.userId} users={users} onChange={setFilters} />
      <AdminSummary report={{
        month: '2026-07', totalMinutes: 900, records: [],
        totalsByUser: users.map((user, index) => ({ user, totalMinutes: (5 - index) * 60 })),
      }} />
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<Preview />)
```

Run: `npm run dev --workspace apps/web -- --host 127.0.0.1`

Expected: `http://127.0.0.1:5173/visual-preview.html` renders all three target components.

- [ ] **Step 3: 320px, 360px, 390px, 430px, 1280px 실측**

각 너비에서 다음 값을 읽는다.

- 시작 `select`, `.time-arrow`, 종료 `select`의 계산 높이가 모두 48px
- 세 요소 중심 Y 차이가 각각 1px 이하
- `.admin-select-control select`와 SVG 중심 Y 차이가 1px 이하
- 직원 합계 기본 목록이 3행이고 `전체 N명 보기` 후 최대 10행
- 긴 이름과 합계 시간이 카드 너비를 침범하지 않음
- `document.documentElement.scrollWidth === document.documentElement.clientWidth`

- [ ] **Step 4: 임시 실측 파일 삭제**

Delete only `apps/web/visual-preview.html` and `apps/web/src/visual-preview.tsx` with `apply_patch`, then confirm neither path appears in `git status --short`.

- [ ] **Step 5: 실측 결함 수정 시 대상 테스트부터 RED-GREEN 재실행**

Expected: 결함마다 실패 테스트를 먼저 추가하고 최소 수정 후 대상 테스트와 Step 1을 다시 통과한다.

- [ ] **Step 6: 검증 수정 커밋**

검증 중 코드 변경이 있을 때만 관련 파일을 명시적으로 스테이징하고 다음 메시지로 커밋한다.

```bash
git commit -m "fix(web): contain ranked summary across viewports"
```

### Task 5: 운영 백업과 웹 전용 배포

**Files:**
- No repository source changes expected.

**Interfaces:**
- Consumes: `/opt/overtime/.env.backup`, `compose.production.yaml`, 검증된 웹 소스
- Produces: `https://aims-overtime.duckdns.org`의 새 웹 배포

- [ ] **Step 1: 운영 PostgreSQL 백업 생성**

Run:

```bash
ssh -i /Users/jun/Downloads/ssh-key-2026-07-15.key ubuntu@161.33.180.132 'set -eu; cd /opt/overtime; set -a; . ./.env.backup; set +a; ./docker/postgres-backup.sh'
```

Expected: `/data/overtime/postgres-backups/overtime-<timestamp>.dump` 생성과 exit 0.

- [ ] **Step 2: 배포 전 데이터 건수 기록**

Run:

```bash
ssh -i /Users/jun/Downloads/ssh-key-2026-07-15.key ubuntu@161.33.180.132 "set -eu; cd /opt/overtime; docker compose --env-file .env.production -f compose.production.yaml exec -T postgres sh -c 'psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atc \"SELECT (SELECT count(*) FROM users)||chr(124)||(SELECT count(*) FROM overtime_records);\"'"
```

Expected: `users|overtime_records` 형식의 두 건수 출력.

- [ ] **Step 3: 검증된 소스만 동기화**

Run:

```bash
rsync -az --exclude .git/ --exclude node_modules/ --exclude '*/node_modules/' --exclude '*/dist/' --exclude '.env*' --exclude apps/coupang-ledger/ --exclude data/ --exclude .superpowers/ -e 'ssh -i /Users/jun/Downloads/ssh-key-2026-07-15.key' ./ ubuntu@161.33.180.132:/opt/overtime/
```

Expected: `.env.production`, PostgreSQL 데이터, 백업 덤프와 `apps/coupang-ledger/`는 전송 또는 삭제되지 않는다.

- [ ] **Step 4: 웹 컨테이너만 재빌드·기동**

```bash
ssh -i /Users/jun/Downloads/ssh-key-2026-07-15.key ubuntu@161.33.180.132 'cd /opt/overtime && docker compose --env-file .env.production -f compose.production.yaml build web'
ssh -i /Users/jun/Downloads/ssh-key-2026-07-15.key ubuntu@161.33.180.132 'cd /opt/overtime && docker compose --env-file .env.production -f compose.production.yaml up -d --no-deps web'
```

Expected: web만 재생성되고 API와 PostgreSQL의 생성 시각은 유지된다.

- [ ] **Step 5: 운영 검증**

- 홈페이지, API health, 새 JS/CSS asset이 HTTP 200
- 운영 CSS에 새 48px 시간 규칙과 관리자 select 아이콘 규칙 포함
- API와 PostgreSQL이 healthy
- 배포 후 `users`와 `overtime_records` 건수가 Step 2와 동일

배포 후 데이터 건수는 다음 명령으로 다시 읽는다.

```bash
ssh -i /Users/jun/Downloads/ssh-key-2026-07-15.key ubuntu@161.33.180.132 "set -eu; cd /opt/overtime; docker compose --env-file .env.production -f compose.production.yaml exec -T postgres sh -c 'psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atc \"SELECT (SELECT count(*) FROM users)||chr(124)||(SELECT count(*) FROM overtime_records);\"'"
```

- [ ] **Step 6: main 푸시와 원격 검증**

```bash
git push origin main
git ls-remote origin refs/heads/main
```

Expected: remote `main` SHA가 local `HEAD`와 일치한다.
