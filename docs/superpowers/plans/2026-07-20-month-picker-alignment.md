# Month Picker Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 최근 내역의 월 선택 입력을 모바일에서 정확히 정렬하고, PC에서도 브라우저 기본 지원 여부와 관계없이 클릭 가능한 월 선택창을 제공한다.

**Architecture:** 네이티브 `input[type="month"]` 의존성을 제거하고 React 기반 `MonthPicker`를 만든다. 트리거는 입력창처럼 보이지만 클릭하면 연도 이동과 12개월 선택이 가능한 팝오버를 열며, 선택 결과는 기존 `YYYY-MM` 상태와 API 쿼리에 그대로 전달한다.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, CSS

## Global Constraints

- 모바일 320px 이상에서 가로 스크롤이 생기지 않아야 한다.
- 모바일에서는 월 선택 트리거가 `최근 내역` 아래에서 콘텐츠 전체 너비를 사용한다.
- PC에서는 월 선택 트리거 클릭 시 브라우저 종류와 무관하게 월 선택창이 열린다.
- 기존 `/api/overtime?month=YYYY-MM` 계약과 운영 데이터는 변경하지 않는다.

---

### Task 1: 재사용 가능한 월 선택 컴포넌트

**Files:**
- Create: `apps/web/src/ui/MonthPicker.tsx`
- Create: `apps/web/src/ui/MonthPicker.test.tsx`
- Modify: `apps/web/src/ui/Icon.tsx`

**Interfaces:**
- Consumes: `value: string`, `onChange(value: string): void`, `label: string`
- Produces: 입력창 형태의 트리거와 연도/월 선택 팝오버

- [ ] **Step 1: Write the failing tests**

월 선택 트리거 클릭 시 `role="dialog"`인 선택창이 열리고, 연도 이동 및 월 선택 후 `YYYY-MM`이 전달되는 테스트를 작성한다.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/web -- --run src/ui/MonthPicker.test.tsx`

Expected: `MonthPicker` 모듈이 없어 FAIL.

- [ ] **Step 3: Write minimal implementation**

입력형 트리거, 달력 아이콘, 연도 이동 버튼, 12개월 그리드, 바깥 클릭과 Escape 닫기를 구현한다.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w apps/web -- --run src/ui/MonthPicker.test.tsx`

Expected: PASS.

### Task 2: 최근 내역 연결 및 모바일 정렬

**Files:**
- Modify: `apps/web/src/overtime/OvertimePage.tsx`
- Modify: `apps/web/src/overtime/OvertimePage.test.tsx`
- Modify: `apps/web/src/styles/global.css`

**Interfaces:**
- Consumes: `MonthPicker`
- Produces: 기존 월별 조회 동작과 모바일 전체 너비 정렬

- [ ] **Step 1: Write the failing integration and style tests**

월 선택창에서 다른 달을 누르면 해당 월 API 요청이 발생하고, 모바일 미디어 쿼리에서 제목과 트리거가 세로 배치 및 전체 너비가 되는지 검증한다.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -w apps/web -- --run src/overtime/OvertimePage.test.tsx`

Expected: 기존 네이티브 월 입력 때문에 FAIL.

- [ ] **Step 3: Integrate the component and styles**

`OvertimePage`의 네이티브 월 입력을 `MonthPicker`로 교체하고 데스크톱 팝오버 및 모바일 1열 정렬 스타일을 추가한다.

- [ ] **Step 4: Run focused tests**

Run: `npm run test -w apps/web -- --run src/ui/MonthPicker.test.tsx src/overtime/OvertimePage.test.tsx`

Expected: PASS.

### Task 3: 브라우저 및 전체 검증

**Files:**
- Modify: 변경 없음

**Interfaces:**
- Consumes: 완성된 웹 앱
- Produces: 모바일/PC 검증 결과와 배포 가능한 빌드

- [ ] **Step 1: Run all web checks**

Run: `npm run test -w apps/web -- --run && npm run lint -w apps/web && npm run build -w apps/web`

Expected: 모든 명령 exit 0.

- [ ] **Step 2: Verify responsive layout in the browser**

320, 360, 390, 430px에서 트리거 좌우 좌표와 `scrollWidth === clientWidth`를 확인하고, 1280px에서 클릭 시 월 선택 팝오버가 열리는지 확인한다.

- [ ] **Step 3: Commit, merge, deploy, and smoke-test**

변경을 커밋하여 `main`에 병합하고 원격에 푸시한 뒤 OCI 웹 컨테이너만 재배포한다. 운영 DB 컨테이너와 볼륨은 변경하지 않고, 배포 후 헬스 체크와 실제 자산 커밋을 확인한다.
