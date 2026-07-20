# Work Date Input Width Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 추가 근무 모달의 근무 날짜 input이 모바일에서 부모 너비를 초과하지 않도록 수정한다.

**Architecture:** `input[type="date"]`에 전용 클래스와 논리적 너비 제한을 적용한다. 네이티브 날짜 선택 기능과 기존 폼 데이터 흐름은 그대로 유지하며 CSS와 회귀 테스트만 최소 변경한다.

**Tech Stack:** React 19, TypeScript, CSS, Vitest

## Global Constraints

- 네이티브 날짜 선택 기능을 유지한다.
- 월 선택기, API, PostgreSQL 데이터는 변경하지 않는다.
- 320px, 360px, 390px, 430px에서 날짜 input이 부모 필드를 초과하지 않아야 한다.

---

### Task 1: 날짜 입력 너비 회귀 수정

**Files:**
- Modify: `apps/web/src/overtime/OvertimeForm.tsx`
- Modify: `apps/web/src/overtime/OvertimeForm.test.tsx`
- Modify: `apps/web/src/styles/global.css`

**Interfaces:**
- Consumes: 기존 `values.workDate`와 `update('workDate', value)`
- Produces: 부모 필드 내부에 제한된 `.work-date-input`

- [ ] **Step 1: Write the failing test**

`OvertimeForm.test.tsx`에서 근무 날짜 input이 `work-date-input` 클래스를 가지며 CSS에 `inline-size: 100%`, `min-inline-size: 0`, `max-inline-size: 100%`, `overflow: hidden`이 존재하는지 검증한다.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm run test -w apps/web -- --run src/overtime/OvertimeForm.test.tsx`

Expected: 전용 클래스와 CSS가 없어 FAIL.

- [ ] **Step 3: Implement the minimum fix**

근무 날짜 input에 `className="work-date-input"`을 추가하고 다음 CSS를 추가한다.

```css
.work-date-input {
  display: block;
  inline-size: 100%;
  min-inline-size: 0;
  max-inline-size: 100%;
  overflow: hidden;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm run test -w apps/web -- --run src/overtime/OvertimeForm.test.tsx`

Expected: PASS.

### Task 2: 반응형·전체·운영 검증

**Files:**
- Modify: 변경 없음

**Interfaces:**
- Consumes: 수정된 웹 앱
- Produces: 브라우저 실측과 배포 결과

- [ ] **Step 1: Measure the modal and date input**

320px, 360px, 390px, 430px에서 폼·필드·날짜 input 좌우 좌표와 문서 overflow를 측정한다.

- [ ] **Step 2: Run all verification commands**

Run: `npm run test -w apps/web -- --run && npm run lint -w apps/web && npm run build -w apps/web`

Expected: 모든 명령 exit 0.

- [ ] **Step 3: Commit, push, back up, and deploy web only**

수정 파일을 main에 커밋·푸시하고 운영 PostgreSQL을 백업한 뒤 `web` 이미지만 다시 빌드해 `--no-deps web`으로 교체한다. HTTPS health와 운영 데이터 건수를 읽기 전용으로 확인한다.
