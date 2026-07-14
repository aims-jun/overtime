# Admin Home Routing and Duration Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route administrators directly to the admin dashboard and display admin overtime durations in the same human-readable format used by employees.

**Architecture:** Add a small role-aware home route inside the existing protected router so administrators never mount the personal overtime page. Reuse the existing `formatMinutes(number): string` frontend utility in admin components instead of formatting raw minute counts locally.

**Tech Stack:** React 19, TypeScript, React Router, TanStack Query, Testing Library, MSW, Vitest

## Global Constraints

- Administrators accessing `/` are redirected to `/admin` with history replacement.
- Administrator `AIMS` brand links point to `/admin`; employee brand links remain `/`.
- Administrators do not mount the personal overtime page or request `/api/overtime` from the home route.
- Employees retain the personal home page and existing 403 response for `/admin`.
- Human-readable duration examples are exact: `0시간`, `30분`, `1시간`, `1시간 30분`.
- Backend authorization, session data, APIs, and CSV formatting do not change.

---

### Task 1: Role-aware protected home

**Files:**
- Modify: `apps/web/src/app/router.tsx:12-54`
- Test: `apps/web/src/App.test.tsx`

**Interfaces:**
- Consumes: `useAuth().user.isAdmin: boolean`
- Produces: `RoleHome` route element and role-specific brand-link destinations

- [x] **Step 1: Write a failing administrator-home test**

Update the Vitest import to include `vi`, then add this test to `App.test.tsx`:

```tsx
it('redirects an administrator home without loading personal overtime', async () => {
  const overtimeRequest = vi.fn()
  server.use(
    http.get('/api/auth/me', () =>
      HttpResponse.json({
        user: {
          id: 'admin-1',
          email: 'contact@aimskr.com',
          name: 'AIMS 관리자',
          isAdmin: true,
        },
      }),
    ),
    http.get('/api/overtime', () => {
      overtimeRequest()
      return HttpResponse.json({ month: '2026-07', records: [], totalMinutes: 0 })
    }),
    http.get('/api/admin/users', () => HttpResponse.json([])),
    http.get('/api/admin/reports', () =>
      HttpResponse.json({
        month: '2026-07',
        totalMinutes: 0,
        totalsByUser: [],
        records: [],
      }),
    ),
  )
  await router.navigate('/')
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  )

  expect(
    await screen.findByRole('heading', { name: '업무 연장 현황' }),
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/admin')
  expect(screen.getByRole('link', { name: 'AIMS' })).toHaveAttribute(
    'href',
    '/admin',
  )
  expect(
    screen.queryByRole('heading', { name: '업무 연장 내역' }),
  ).not.toBeInTheDocument()
  expect(overtimeRequest).not.toHaveBeenCalled()
})
```

- [x] **Step 2: Run the focused app test and verify RED**

Run: `npm run test --workspace apps/web -- --run src/App.test.tsx`

Expected: FAIL because the administrator remains on `/`, sees `업무 연장 내역`, and requests `/api/overtime`.

- [x] **Step 3: Add the role-aware home element**

Add this component to `router.tsx`:

```tsx
function RoleHome() {
  const { user } = useAuth()
  if (user?.isAdmin) return <Navigate to="/admin" replace />
  return <OvertimePage />
}
```

Change the protected root route to:

```tsx
{ path: '/', element: <RoleHome /> },
```

- [x] **Step 4: Make the brand link role-aware**

In `ProtectedLayout`, replace the brand link with:

```tsx
<Link className="brand" to={user.isAdmin ? '/admin' : '/'}>AIMS</Link>
```

- [x] **Step 5: Run the focused app test and verify GREEN**

Run: `npm run test --workspace apps/web -- --run src/App.test.tsx`

Expected: all 3 App tests pass; the administrator lands on `/admin` without a personal overtime request, and existing employee cases still pass.

- [x] **Step 6: Commit the routing behavior**

```bash
git add apps/web/src/app/router.tsx apps/web/src/App.test.tsx
git commit -m "feat: route administrators to admin home"
```

### Task 2: Human-readable administrator durations

**Files:**
- Modify: `apps/web/src/admin/AdminTable.tsx:1-35`
- Modify: `apps/web/src/admin/AdminSummary.tsx:4-12`
- Test: `apps/web/src/admin/AdminPage.test.tsx:20-72`

**Interfaces:**
- Consumes: `formatMinutes(value: number): string` from `apps/web/src/overtime/time-preview.ts`
- Produces: human-readable admin table and summary duration copy

- [x] **Step 1: Write failing admin duration expectations**

Change the synchronized report fixture's `totalMinutes`, per-user `totalMinutes`, and record `durationMinutes` from `150` to `60`. Replace the current total assertions with:

```tsx
const total = screen.getByLabelText('전체 업무 연장 합계')
expect(within(total).getByText('1시간')).toBeInTheDocument()
expect(within(total).getByText('TOTAL EXTENDED')).toBeInTheDocument()
expect(within(total).queryByText('60분')).not.toBeInTheDocument()

const recordRow = screen.getByText('배포 대응').closest('tr')
expect(recordRow).not.toBeNull()
expect(within(recordRow!).getByText('1시간')).toBeInTheDocument()
expect(within(recordRow!).queryByText('60분')).not.toBeInTheDocument()
```

- [x] **Step 2: Run the focused admin test and verify RED**

Run: `npm run test --workspace apps/web -- --run src/admin/AdminPage.test.tsx`

Expected: FAIL because the table renders `60분` and the summary small text also renders `60분` instead of `TOTAL EXTENDED`.

- [x] **Step 3: Reuse the shared formatter in the table**

Import the utility in `AdminTable.tsx`:

```tsx
import { formatMinutes } from '../overtime/time-preview'
```

Replace the duration cell with:

```tsx
<td>{formatMinutes(record.durationMinutes)}</td>
```

- [x] **Step 4: Remove the duplicate raw-minute summary copy**

Replace the summary's raw-minute small text with:

```tsx
<small>TOTAL EXTENDED</small>
```

- [x] **Step 5: Run the focused admin test and verify GREEN**

Run: `npm run test --workspace apps/web -- --run src/admin/AdminPage.test.tsx`

Expected: both AdminPage tests pass; the 60-minute record and total display as `1시간`.

- [x] **Step 6: Commit the administrator duration formatting**

```bash
git add apps/web/src/admin/AdminTable.tsx apps/web/src/admin/AdminSummary.tsx apps/web/src/admin/AdminPage.test.tsx
git commit -m "fix: format admin overtime durations"
```

### Task 3: Full verification and plan completion

**Files:**
- Modify: `docs/superpowers/plans/2026-07-14-admin-home-duration-format.md`

**Interfaces:**
- Consumes: completed role-aware routing and admin duration formatting
- Produces: verified repository state and a completed plan checklist

- [x] **Step 1: Run all tests**

Run: `npm test`

Expected: all API Jest and web Vitest tests pass with zero failures.

- [x] **Step 2: Run the complete API E2E suite**

Run: `npm run test:e2e --workspace apps/api -- --runInBand`

Expected: all API E2E suites pass with zero failures.

- [x] **Step 3: Run lint and production builds**

Run: `npm run lint`

Expected: API ESLint and web oxlint exit with code 0.

Run: `npm run build`

Expected: Nest and Vite production builds exit with code 0.

- [x] **Step 4: Verify scope**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only the implementation plan remains modified after both implementation commits.

- [x] **Step 5: Complete and commit the plan**

Mark every completed checkbox `[x]`, then run:

```bash
git add docs/superpowers/plans/2026-07-14-admin-home-duration-format.md
git commit -m "docs: complete admin home routing plan"
```
