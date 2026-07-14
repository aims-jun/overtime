# 30-Minute Time Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make overtime start and end times selectable only in 30-minute increments and reject off-grid API requests.

**Architecture:** Generate the 48 valid `HH:mm` values in a small frontend utility and render both time fields as native select lists. Keep the existing string payload and preview flow, while narrowing both Nest DTO validation and domain validation to minutes `00` or `30`.

**Tech Stack:** React 19, TypeScript, Testing Library, Vitest, NestJS, class-validator, Jest, Supertest

## Global Constraints

- Valid choices run from `00:00` through `23:30` in 30-minute increments.
- Default values remain `18:00` and `19:00`.
- The request and response format remains `HH:mm` strings.
- Midnight crossing, the 16-hour maximum, overlap detection, dates, and work-reason behavior do not change.
- No migration or automatic correction for old off-grid records.

---

### Task 1: Frontend time choices and select fields

**Files:**
- Create: `apps/web/src/overtime/time-options.ts`
- Modify: `apps/web/src/overtime/OvertimeForm.tsx:1-125`
- Test: `apps/web/src/overtime/OvertimeForm.test.tsx`

**Interfaces:**
- Produces: `THIRTY_MINUTE_TIME_OPTIONS: readonly string[]`
- Consumes: existing `OvertimeFormValues.startTime` and `OvertimeFormValues.endTime` `HH:mm` strings

- [x] **Step 1: Write failing web tests for the valid choices**

Import `within` and add a test that inspects each field independently:

```tsx
import { render, screen, within } from '@testing-library/react'

it('offers start and end times in 30-minute increments', () => {
  render(<OvertimeForm onSaved={vi.fn()} />)

  for (const label of ['시작 시간', '종료 시간']) {
    const select = screen.getByLabelText(label)
    const options = within(select).getAllByRole('option')

    expect(options).toHaveLength(48)
    expect(options[0]).toHaveTextContent('00:00')
    expect(options[1]).toHaveTextContent('00:30')
    expect(options[47]).toHaveTextContent('23:30')
    expect(within(select).queryByRole('option', { name: '18:10' })).not.toBeInTheDocument()
  }

  expect(screen.getByLabelText('시작 시간')).toHaveValue('18:00')
  expect(screen.getByLabelText('종료 시간')).toHaveValue('19:00')
})
```

- [x] **Step 2: Run the focused web test and verify RED**

Run: `npm run test --workspace apps/web -- --run src/overtime/OvertimeForm.test.tsx`

Expected: FAIL because the current `input type="time"` elements contain no `option` roles.

- [x] **Step 3: Create the time-option utility**

Create `apps/web/src/overtime/time-options.ts`:

```ts
export const THIRTY_MINUTE_TIME_OPTIONS = Array.from(
  { length: 48 },
  (_, index) => {
    const hours = Math.floor(index / 2).toString().padStart(2, '0')
    const minutes = index % 2 === 0 ? '00' : '30'
    return `${hours}:${minutes}`
  },
)
```

- [x] **Step 4: Render both fields as select lists**

Import the constant in `OvertimeForm.tsx`, then replace each time input with this structure while preserving its label, value, change handler, and `required` attribute:

```tsx
<select
  value={values.startTime}
  onChange={(event) => update('startTime', event.target.value)}
  required
>
  {THIRTY_MINUTE_TIME_OPTIONS.map((time) => (
    <option key={time} value={time}>{time}</option>
  ))}
</select>
```

Apply the same mapping to `endTime`.

- [x] **Step 5: Update the midnight test to select values**

Replace clear/type operations with:

```tsx
await user.selectOptions(screen.getByLabelText('시작 시간'), '22:30')
await user.selectOptions(screen.getByLabelText('종료 시간'), '01:00')
```

- [x] **Step 6: Run the focused web test and verify GREEN**

Run: `npm run test --workspace apps/web -- --run src/overtime/OvertimeForm.test.tsx`

Expected: 3 tests pass, including the midnight preview.

- [x] **Step 7: Commit the frontend behavior**

```bash
git add apps/web/src/overtime/time-options.ts apps/web/src/overtime/OvertimeForm.tsx apps/web/src/overtime/OvertimeForm.test.tsx
git commit -m "feat: add thirty-minute time selectors"
```

### Task 2: API enforcement for 30-minute increments

**Files:**
- Modify: `apps/api/src/overtime/domain/overtime-time.ts:1-22`
- Test: `apps/api/src/overtime/domain/overtime-time.spec.ts:38-52`
- Modify: `apps/api/src/overtime/dto/create-overtime.dto.ts:1-17`
- Test: `apps/api/test/overtime.e2e-spec.ts:150-170`

**Interfaces:**
- Consumes: `CreateOvertimeDto.startTime` and `endTime` strings
- Produces: accepted time pattern `^([01]\d|2[0-3]):(00|30)$` at both HTTP and domain boundaries

- [x] **Step 1: Write failing domain tests for off-grid minutes**

Add these cases to the invalid interval table:

```ts
{ workDate: '2026-07-13', startTime: '18:10', endTime: '20:00' },
{ workDate: '2026-07-13', startTime: '18:00', endTime: '20:45' },
```

- [x] **Step 2: Write a failing HTTP validation test**

Add this test to `overtime.e2e-spec.ts`:

```ts
it('rejects times outside thirty-minute increments', async () => {
  const cookie = await login();

  await request(app.getHttpServer())
    .post('/api/overtime')
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', cookie)
    .send({
      workDate: '2026-07-13',
      startTime: '18:10',
      endTime: '20:00',
      reason: '잘못된 시간 입력',
    })
    .expect(400);
});
```

- [x] **Step 3: Run the focused API tests and verify RED**

Run: `npm run test --workspace apps/api -- --runInBand src/overtime/domain/overtime-time.spec.ts`

Expected: FAIL because `18:10` and `20:45` currently match the general `HH:mm` pattern.

Run: `npm run test:e2e --workspace apps/api -- --runInBand test/overtime.e2e-spec.ts`

Expected: FAIL because the POST currently returns `201` for `18:10`.

- [x] **Step 4: Narrow domain and DTO patterns**

Use the same minute rule in both files:

```ts
const TIME_PATTERN = /^([01]\d|2[0-3]):(00|30)$/;
```

Update both DTO decorators to:

```ts
@Matches(/^([01]\d|2[0-3]):(00|30)$/)
```

- [x] **Step 5: Run the focused API tests and verify GREEN**

Run: `npm run test --workspace apps/api -- --runInBand src/overtime/domain/overtime-time.spec.ts`

Expected: domain test suite passes.

Run: `npm run test:e2e --workspace apps/api -- --runInBand test/overtime.e2e-spec.ts`

Expected: employee overtime E2E suite passes and the invalid request returns `400`.

- [x] **Step 6: Commit the API enforcement**

```bash
git add apps/api/src/overtime/domain/overtime-time.ts apps/api/src/overtime/domain/overtime-time.spec.ts apps/api/src/overtime/dto/create-overtime.dto.ts apps/api/test/overtime.e2e-spec.ts
git commit -m "feat: enforce thirty-minute overtime intervals"
```

### Task 3: Full verification and plan completion

**Files:**
- Modify: `docs/superpowers/plans/2026-07-14-thirty-minute-time-input.md`

**Interfaces:**
- Consumes: completed frontend selector and API validation behavior
- Produces: verified repository state with all plan checkboxes completed

- [x] **Step 1: Run all unit and component tests**

Run: `npm test`

Expected: all API Jest and web Vitest suites pass with zero failures.

- [x] **Step 2: Run the complete API E2E suite**

Run: `npm run test:e2e --workspace apps/api -- --runInBand`

Expected: all API E2E suites pass with zero failures.

- [x] **Step 3: Run static checks and production builds**

Run: `npm run lint`

Expected: API ESLint and web oxlint exit with code 0.

Run: `npm run build`

Expected: Nest and Vite production builds exit with code 0.

- [x] **Step 4: Verify scope and repository state**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only the implementation plan is modified after the two implementation commits.

- [x] **Step 5: Mark completed checkboxes and commit the plan**

```bash
git add docs/superpowers/plans/2026-07-14-thirty-minute-time-input.md
git commit -m "docs: complete thirty-minute input plan"
```
