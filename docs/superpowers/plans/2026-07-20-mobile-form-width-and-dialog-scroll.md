# Mobile Form Width and Dialog Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent horizontal scrolling on phone-sized screens and keep the page behind the overtime editor dialog stationary.

**Architecture:** Keep the native dialog and existing form structure. Add explicit width containment to native form controls and modal content, then add a small reference-counted document scroll lock owned by the shared `Dialog` component so every modal gets consistent behavior.

**Tech Stack:** React 19, TypeScript, native HTML dialog, CSS media queries, Vitest, Testing Library

## Global Constraints

- Do not change API, database, authentication, or production data behavior.
- Preserve the current bottom-sheet appearance below 768px.
- Support viewport widths of 320px, 360px, 390px, and 430px without horizontal overflow.
- Lock only the page behind an open dialog; the dialog content must remain vertically scrollable.

---

### Task 1: Lock background scrolling while a dialog is open

**Files:**
- Modify: `apps/web/src/ui/Dialog.test.tsx`
- Modify: `apps/web/src/ui/Dialog.tsx`
- Modify: `apps/web/src/styles/global.css`

**Interfaces:**
- Consumes: `DialogProps.open`
- Produces: the `dialog-open` class on `document.documentElement` while one or more shared dialogs are mounted

- [ ] **Step 1: Write the failing test**

Add a test that opens `Dialog`, expects `document.documentElement` to have `dialog-open`, closes it, and expects the class to be removed.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/web -- --run src/ui/Dialog.test.tsx`

Expected: FAIL because `dialog-open` is not added.

- [ ] **Step 3: Write minimal implementation**

Add module-level lock counting in `Dialog.tsx`. On open, add `dialog-open`; on cleanup, decrement and remove the class only when no dialogs remain. Add CSS that disables page overflow while preserving scroll inside `.app-dialog` and contains overscroll.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w apps/web -- --run src/ui/Dialog.test.tsx`

Expected: PASS.

### Task 2: Contain form controls and modal width on phones

**Files:**
- Modify: `apps/web/src/overtime/OvertimeForm.test.tsx`
- Modify: `apps/web/src/styles/global.css`

**Interfaces:**
- Consumes: existing `.record-form`, `.field`, `.time-fields`, and `.app-dialog` class names
- Produces: CSS width constraints for native date/select/textarea controls and mobile dialogs

- [ ] **Step 1: Write the failing test**

Read `src/styles/global.css` and assert that record-form controls have `min-width: 0` and `max-width: 100%`, form grid children can shrink, and the mobile dialog uses a viewport-safe inline size.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/web -- --run src/overtime/OvertimeForm.test.tsx`

Expected: FAIL because the explicit constraints are missing.

- [ ] **Step 3: Write minimal implementation**

Add shrink-safe rules to the form controls and grid children. Change the mobile dialog from an unconstrained `width: 100%` declaration to viewport-safe `width` and `max-width` values, and clip accidental root-level horizontal paint overflow as a final safeguard.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w apps/web -- --run src/overtime/OvertimeForm.test.tsx`

Expected: PASS.

### Task 3: Regression verification

**Files:**
- Verify only

**Interfaces:**
- Consumes: completed dialog and responsive CSS changes
- Produces: verified web build with no regressions

- [ ] **Step 1: Run the complete web test suite**

Run: `npm run test -w apps/web -- --run`

Expected: 7 test files and all tests PASS.

- [ ] **Step 2: Run lint and production build**

Run: `npm run lint -w apps/web && npm run build -w apps/web`

Expected: both commands exit 0.

- [ ] **Step 3: Verify responsive behavior in a browser**

At 320px, 360px, 390px, and 430px, confirm `document.documentElement.scrollWidth === document.documentElement.clientWidth`. Open the overtime editor and confirm the background scroll position does not change while the dialog remains independently scrollable.
