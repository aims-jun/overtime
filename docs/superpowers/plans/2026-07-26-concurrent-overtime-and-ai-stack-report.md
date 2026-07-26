# Concurrent Overtime Guard and AI Stack Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent concurrent overlapping overtime writes at the PostgreSQL boundary and publish an accurate Notion-ready learning-project report.

**Architecture:** A TypeORM migration adds PostgreSQL `btree_gist` and an exclusion constraint over each user's `[start_at, end_at)` range. The repository converts only PostgreSQL exclusion violations (`23P01`) into its existing `null` overlap result, which the service already maps to `OVERTIME_OVERLAP`. The report and supporting docs describe the actual implementation and validation boundaries.

**Tech Stack:** NestJS 11, TypeORM 0.3, PostgreSQL 17, Jest 30, Supertest, ExcelJS, Markdown.

## Global Constraints

- Preserve the API error contract: an overlap returns HTTP 409 with code `OVERTIME_OVERLAP`.
- Treat time ranges as `[start_at, end_at)`: adjacent records are valid; every true overlap is rejected.
- Do not enable TypeORM `synchronize` or automatic migration execution.
- Catch only PostgreSQL SQLSTATE `23P01`; rethrow every other database failure.
- Keep the report factual: Zod validates environment values, while HTTP request DTOs use Nest `ValidationPipe` and `class-validator`.
- State PostgreSQL E2E verification only when it has actually been run against Docker.

---

### Task 1: Map database overlap violations to the existing repository result

**Files:**
- Create: `apps/api/src/overtime/typeorm-overtime.repository.spec.ts`
- Modify: `apps/api/src/overtime/typeorm-overtime.repository.ts`

**Interfaces:**
- Consumes: `TypeOrmOvertimeRepository.saveIfNoOverlap(record): Promise<OvertimeRecordEntity | null>`.
- Produces: PostgreSQL query errors with `code === '23P01'` return `null`; other query errors are rethrown.

- [ ] **Step 1: Write the failing test**

```ts
it('returns null when PostgreSQL rejects an overlapping time range', async () => {
  const repository = createRepository({
    transaction: jest.fn(async (work) =>
      work({
        getRepository: () => ({
          createQueryBuilder: () => overlapFreeQuery(),
          save: jest.fn().mockRejectedValue({ code: '23P01' }),
        }),
      }),
    ),
  })

  await expect(repository.saveIfNoOverlap(record())).resolves.toBeNull()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w apps/api -- --runInBand src/overtime/typeorm-overtime.repository.spec.ts`

Expected: FAIL because the `23P01` query error rejects rather than resolving to `null`.

- [ ] **Step 3: Add the minimal error classifier and catch**

```ts
function isPostgresExclusionViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    'code' in error && (error as { code?: unknown }).code === '23P01'
}

try {
  return await this.dataSource.transaction(async (manager) => { /* existing lookup and save */ })
} catch (error) {
  if (isPostgresExclusionViolation(error)) return null
  throw error
}
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm run test -w apps/api -- --runInBand src/overtime/typeorm-overtime.repository.spec.ts`

Expected: PASS, including a test that a non-`23P01` error is rethrown.

- [ ] **Step 5: Commit the repository behavior**

```bash
git add apps/api/src/overtime/typeorm-overtime.repository.ts apps/api/src/overtime/typeorm-overtime.repository.spec.ts
git commit -m "fix(api): map database overlap conflicts to 409"
```

### Task 2: Add the database-level no-overlap invariant

**Files:**
- Create: `apps/api/src/database/migrations/0002-add-overtime-overlap-constraint.ts`
- Modify: `apps/api/src/database/typeorm.config.ts`
- Modify: `apps/api/test/overtime.e2e-spec.ts`

**Interfaces:**
- Consumes: the existing `overtime_records(user_id, start_at, end_at)` table.
- Produces: migration `AddOvertimeOverlapConstraint1753500000000` registered in `createTypeOrmOptions`.

- [ ] **Step 1: Write the failing PostgreSQL E2E test**

```ts
it('allows only one of two simultaneous overlapping creates', async () => {
  const cookie = await login()
  const requests = await Promise.all([createRecord(cookie), createRecord(cookie)])
  const statuses = requests.map((response) => response.status).sort()

  expect(statuses).toEqual([201, 409])
  expect(requests.find((response) => response.status === 409)?.body).toMatchObject({
    code: 'OVERTIME_OVERLAP',
  })
  const listed = await request(app.getHttpServer())
    .get('/api/overtime?month=2026-07')
    .set('Cookie', cookie)
    .expect(200)
  expect(listed.body).toMatchObject({ totalMinutes: 210 })
  expect(listed.body.records).toHaveLength(1)
})
```

- [ ] **Step 2: Run the E2E test to verify the old schema permits the race**

Run: `npm run test:e2e:postgres -- --runInBand apps/api/test/overtime.e2e-spec.ts`

Expected: The test is timing dependent before the migration. Use Task 1's deterministic error-mapping test as the red-green proof. With Docker unavailable, record the daemon failure and do not claim E2E success.

- [ ] **Step 3: Add and register the migration**

```ts
export class AddOvertimeOverlapConstraint1753500000000 implements MigrationInterface {
  name = 'AddOvertimeOverlapConstraint1753500000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS btree_gist')
    await queryRunner.query(`
      ALTER TABLE overtime_records
      ADD CONSTRAINT ex_overtime_records_no_overlap
      EXCLUDE USING gist (
        user_id WITH =,
        tstzrange(start_at, end_at, '[)') WITH &&
      )
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE overtime_records DROP CONSTRAINT ex_overtime_records_no_overlap',
    )
  }
}
```

Register `AddOvertimeOverlapConstraint1753500000000` after `InitialSchema1752360000000` in the TypeORM `migrations` array.

- [ ] **Step 4: Run focused unit and PostgreSQL E2E tests**

Run: `npm run test -w apps/api -- --runInBand src/overtime/typeorm-overtime.repository.spec.ts src/overtime/overtime.service.spec.ts`

Run: `npm run test:e2e:postgres`

Expected: focused tests pass; the E2E command applies both migrations and confirms exactly one parallel write persists. If Docker is unavailable, preserve its failure output as an environment limitation.

- [ ] **Step 5: Commit the constraint and regression test**

```bash
git add apps/api/src/database/migrations/0002-add-overtime-overlap-constraint.ts apps/api/src/database/typeorm.config.ts apps/api/test/overtime.e2e-spec.ts
git commit -m "fix(db): prevent concurrent overtime overlap"
```

### Task 3: Repair Excel terminology and the stale administrator E2E contract

**Files:**
- Modify: `apps/api/test/admin-reports.e2e-spec.ts`
- Modify: `README.md`
- Modify: `docs/runbooks/oracle-deployment.md`

**Interfaces:**
- Consumes: `GET /api/admin/reports.xlsx?month=YYYY-MM&userId=<UUID>`.
- Produces: docs and E2E checks that consistently call the Excel endpoint and expect the XLSX MIME type.

- [ ] **Step 1: Write the Excel endpoint assertion**

```ts
const excel = await request(app.getHttpServer())
  .get(`/api/admin/reports.xlsx?month=2026-07&userId=${employee.userId}`)
  .set('Cookie', admin.cookie)
  .expect('Content-Type', /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/)
  .expect('Content-Disposition', /attachment; filename="aims-overtime-2026-07\.xlsx"/)
  .expect(200)
expect(excel.body).toBeInstanceOf(Buffer)
expect(excel.body.length).toBeGreaterThan(0)
```

- [ ] **Step 2: Run the focused E2E test when Docker is available**

Run: `npm run test:e2e:postgres -- --runInBand apps/api/test/admin-reports.e2e-spec.ts`

Expected: PASS against the existing Excel endpoint. If Docker is unavailable, do not alter the expected contract and record the unexecuted status.

- [ ] **Step 3: Correct reader-facing terminology**

Change README feature descriptions and the Oracle monthly checklist from `CSV` to `Excel(.xlsx)` without changing commands or architecture claims.

- [ ] **Step 4: Run doc and source consistency checks**

Run: `rg -n 'reports\\.csv|BOM CSV|관리자 집계/CSV|CSV 내보내기' README.md docs apps/api/test`

Expected: no stale CSV endpoint or product terminology remains.

- [ ] **Step 5: Commit documentation and E2E contract updates**

```bash
git add README.md docs/runbooks/oracle-deployment.md apps/api/test/admin-reports.e2e-spec.ts
git commit -m "docs: align reports with Excel export"
```

### Task 4: Write the Notion-ready learning project report

**Files:**
- Create: `docs/reports/ai-friendly-overtime-project.md`

**Interfaces:**
- Consumes: the implemented API, database, deployment configuration, tests, and this design.
- Produces: a self-contained Korean Markdown report suitable for direct paste into Notion.

- [ ] **Step 1: Draft the report from verified implementation facts**

Use these sections in this order:

```markdown
# AI를 활용해 작은 사내 서비스를 구현할 때의 스택 선택과 검증

## 한 줄 요약
## 만든 서비스와 범위
## 왜 이 스택을 골랐는가
## AI를 빠르게 쓰기 위한 개발 방식
## 실제로 발견한 문제: 동시 야근 기록 중복
## 검증과 운영에서 신경 쓴 점
## 다음 프로젝트에 적용할 체크리스트
```

Describe React 19, TypeScript, Vite, TanStack Query, React Router, NestJS, TypeORM, PostgreSQL, Google sign-in, ExcelJS, Caddy, and Docker Compose only in terms supported by the repository. Explain that Zod validates configuration while request DTOs use Nest validation. Include the overlap constraint as a concrete example of human review improving AI-assisted implementation.

- [ ] **Step 2: Verify factual statements against source**

Run: `rg -n 'exceljs|ValidationPipe|zod|GOOGLE_HOSTED_DOMAIN|reports\\.xlsx|btree_gist|EXCLUDE USING gist' apps/api README.md compose.production.yaml`

Expected: every report claim maps to an implementation or configuration location; delete or qualify claims with no source.

- [ ] **Step 3: Proofread for Notion readability**

Run: `rg -n 'TBD|TODO|CSV|Zod.*모든 API|테스트.*통과' docs/reports/ai-friendly-overtime-project.md`

Expected: no placeholder, stale CSV terminology, overbroad Zod claim, or unverified passing-test claim.

- [ ] **Step 4: Commit the report**

```bash
git add docs/reports/ai-friendly-overtime-project.md
git commit -m "docs: add AI-friendly overtime project report"
```

### Task 5: Run proportionate final verification

**Files:**
- Verify only; no intended file changes.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: evidence-backed status of unit tests, build, source consistency, and PostgreSQL E2E availability.

- [ ] **Step 1: Run API and web unit tests**

Run: `npm test -- --runInBand`

Expected: report the exact pass/fail result. If SQLite migration tests still require a PostgreSQL instance, state that as a pre-existing test-command design issue rather than claiming a full green suite.

- [ ] **Step 2: Run lint and production build**

Run: `npm run lint && npm run build`

Expected: both commands exit 0.

- [ ] **Step 3: Run PostgreSQL E2E**

Run: `npm run test:e2e:postgres`

Expected: the concurrent overlap and Excel E2E cases pass when Docker is available. If the Docker daemon is unavailable, state the exact blocking message.

- [ ] **Step 4: Inspect changes and commits**

Run: `git status --short && git log --oneline -5 && git diff HEAD~4..HEAD --check`

Expected: only task-related changes are present, commits are scoped, and no whitespace error exists.
