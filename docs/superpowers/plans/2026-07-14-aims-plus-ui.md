# AIMS+ UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current overtime-journal presentation with the approved mobile-first AIMS+ work-extension interface while preserving all existing behavior.

**Architecture:** Keep existing React Query data flow, routes, API types, and backend untouched. Restructure the employee page around a collapsed inline editor, update product terminology across login/employee/admin screens, and replace the visual system in `global.css` with the approved lime and deep-green AIMS+ identity.

**Tech Stack:** React 19, TypeScript, React Router, TanStack Query, Vitest, Testing Library, CSS

## Global Constraints

- Product name is `AIMS+`; employee page title is `업무 연장 내역`.
- Primary action is `+ 업무 시간 추가`; list label is `WORK LOG`.
- Brand colors are lime `#D8FF45` and deep green `#172118`.
- Backend APIs, database, Google authentication, and CRUD semantics do not change.
- Mobile widths from 320px must work; primary controls remain at least 44px high.

---

### Task 1: Employee interaction and product language

**Files:**
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/overtime/OvertimePage.test.tsx`
- Modify: `apps/web/src/overtime/OvertimeForm.test.tsx`
- Modify: `apps/web/src/overtime/OvertimePage.tsx`
- Modify: `apps/web/src/overtime/OvertimeForm.tsx`
- Modify: `apps/web/src/overtime/OvertimeList.tsx`
- Modify: `apps/web/src/app/router.tsx`

**Interfaces:**
- Consumes: existing `MonthlyOvertime`, `OvertimeRecord`, `OvertimeForm` callbacks
- Produces: collapsed `업무 시간 추가` editor that opens for create/edit and closes after save

- [ ] Change tests to expect `AIMS+`, `업무 연장 내역`, `등록된 업무 연장 내역이 없습니다`, `업무 내용`, and `추가 근무 시간 2시간 30분`; add a test that the editor is hidden initially and opens after clicking `+ 업무 시간 추가`.
- [ ] Run `npm run test --workspace apps/web -- --run` and confirm failures reference the old product copy and always-visible editor.
- [ ] Add `editorOpen` state to `OvertimePage`; open it from the primary action and edit buttons, close it after save/cancel, and retain React Query invalidation.
- [ ] Replace employee-facing “야근” language with “업무 연장”, “업무 내용”, and “추가 근무 시간”; change the protected header brand to `AIMS+`.
- [ ] Run the focused web tests and confirm the new interaction and copy pass.

### Task 2: Login and administrator product language

**Files:**
- Modify: `apps/web/src/admin/AdminPage.test.tsx`
- Modify: `apps/web/src/auth/LoginPage.tsx`
- Modify: `apps/web/src/admin/AdminPage.tsx`
- Modify: `apps/web/src/admin/AdminSummary.tsx`
- Modify: `apps/web/src/admin/AdminTable.tsx`

**Interfaces:**
- Consumes: existing auth and admin report data
- Produces: consistent AIMS+ naming without changing routes or API requests

- [ ] Update admin tests to expect `업무 연장 합계`, `내역 다운로드`, and the new empty-state copy.
- [ ] Run the admin test and confirm it fails against the existing 야근/CSV labels.
- [ ] Update the login card to the `AIMS+` wordmark and company-account message; update admin title, summary labels, table headings, accessibility labels, and empty state.
- [ ] Run `npm run test --workspace apps/web -- --run` and confirm all product-language tests pass.

### Task 3: Approved visual system and responsive layout

**Files:**
- Modify: `apps/web/src/styles/global.css`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: semantic class names already rendered by employee, login, and admin components
- Produces: approved C-direction UI at mobile and desktop widths

- [ ] Add `.superpowers/` to `.gitignore` so visual-companion drafts stay local.
- [ ] Replace the current serif/editorial tokens and rules with system sans typography, `#D8FF45` primary, `#172118` ink, neutral backgrounds, a dark monthly metric card, lime main action, compact work-log rows, and matching login/admin surfaces.
- [ ] Add mobile rules for 320px and 390px: single-column editor, wrapping time fields, full-width action, non-overlapping record actions, and minimum 44px controls.
- [ ] Run `npm run lint --workspace apps/web`, `npm run test --workspace apps/web -- --run`, and `npm run build --workspace apps/web`; confirm all exit successfully.

### Task 4: Browser verification and completion

**Files:**
- Verify only: `apps/web/src/**`

**Interfaces:**
- Consumes: running Vite/Nest development application
- Produces: visual evidence at mobile and desktop sizes

- [ ] Start or reuse the development server and open the employee page in the in-app browser.
- [ ] Inspect 320px, 390px, 768px, and desktop widths for clipping, overflow, focus visibility, and editor/list layout; correct any defects in `global.css`.
- [ ] Run full `npm test`, API E2E, `npm run lint`, and `npm run build`.
- [ ] Stage only the AIMS+ implementation and plan, then commit with `feat: redesign overtime UI as AIMS plus`.
