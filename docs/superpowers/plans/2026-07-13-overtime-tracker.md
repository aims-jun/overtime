# Overtime Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회사 Google 계정으로 로그인한 직원이 모바일에서 야근을 기록하고, 관리자가 월별 현황과 CSV를 확인할 수 있는 서비스를 Docker로 배포 가능한 상태까지 만든다.

**Architecture:** npm workspaces 모노레포 안에 React/Vite 웹과 NestJS API를 둔다. API는 기능별 NestJS 모듈, TypeORM 저장소 경계, SQLite를 사용하며 Google ID 토큰을 검증한 뒤 DB 세션과 안전한 쿠키로 인증한다. 운영 환경은 Caddy와 API의 두 컨테이너를 단일 GCP VM에서 실행하고 SQLite 파일은 Persistent Disk에 보관한다.

**Tech Stack:** Node.js 22.12 이상, npm 10.9 이상, TypeScript, React, Vite, TanStack Query, React Router, NestJS, TypeORM, better-sqlite3, Google Auth Library, Zod, Jest, Supertest, Vitest, Testing Library, Docker Compose, Caddy

## Global Constraints

- 모든 업무 날짜와 사용자 입력 시각은 `Asia/Seoul` 기준으로 해석한다.
- 야근은 0분 초과 16시간 이하이며, 종료 시각이 시작 시각보다 이르면 다음 날 종료로 계산한다.
- 같은 직원의 야근 기록은 서로 겹칠 수 없다.
- 직원은 본인 기록만 생성·조회·수정·삭제하고, 관리자는 전체 기록을 조회하되 다른 직원 기록을 변경하지 못한다.
- Google 사용자는 `sub`로 식별하고 `hd`를 `GOOGLE_HOSTED_DOMAIN`과 비교한다.
- 세션 원문은 DB에 저장하지 않으며 쿠키는 `HttpOnly`, 운영 환경의 `Secure`, `SameSite=Lax`를 사용한다.
- CSV는 UTF-8 BOM을 포함하고 스프레드시트 수식 삽입을 방지한다.
- SQLite 파일은 컨테이너 계층이나 Git에 저장하지 않고 `/data/overtime` Persistent Disk에 보관한다.
- 첫 버전은 단일 회사·단일 팀·단일 API 인스턴스만 지원한다.

---

## 파일 구조와 책임

```text
.
├── package.json                         # npm workspaces와 공통 명령
├── package-lock.json                    # 전체 의존성 잠금
├── .gitignore                           # 빌드 결과, 환경변수, SQLite 제외
├── .env.example                         # 로컬 환경변수 계약
├── compose.yaml                         # 로컬 웹/API 실행
├── compose.production.yaml              # Caddy/API 운영 실행
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── main.ts                  # Nest 부트스트랩과 전역 보안 설정
│   │   │   ├── app.module.ts            # 최상위 모듈
│   │   │   ├── config/                  # 환경변수 스키마와 타입
│   │   │   ├── common/                  # 오류, 요청 ID, 현재 사용자, Guard
│   │   │   ├── database/                # TypeORM 설정, 엔티티, 마이그레이션
│   │   │   ├── auth/                    # Google 검증과 세션
│   │   │   ├── users/                   # 사용자 저장소
│   │   │   ├── overtime/                # 시간 규칙과 직원 CRUD
│   │   │   ├── reports/                 # 관리자 집계와 CSV
│   │   │   └── health/                  # 상태 확인
│   │   └── test/                         # API 통합 테스트와 테스트 앱
│   └── web/
│       ├── src/
│       │   ├── app/                      # 라우터와 QueryClient
│       │   ├── api/                      # fetch 래퍼와 DTO
│       │   ├── auth/                     # 로그인과 세션 상태
│       │   ├── overtime/                 # 직원 화면과 기록 폼
│       │   ├── admin/                    # 관리자 화면
│       │   └── styles/                   # 모바일 우선 전역 스타일
│       └── public/
├── docker/
│   ├── api.Dockerfile                    # Nest 다단계 이미지
│   ├── web.Dockerfile                    # React 빌드와 Caddy 이미지
│   ├── Caddyfile                         # 정적 파일, HTTPS, API 프록시
│   └── backup.sh                         # SQLite 안전 백업과 업로드
├── .github/workflows/ci.yml              # 테스트와 이미지 빌드
└── docs/runbooks/
    ├── local-development.md              # 로컬 실행과 Google 설정
    ├── gcp-deployment.md                 # VM, 디스크, Registry, 예산 알림
    └── backup-restore.md                 # 백업과 복구 검증
```

---

### Task 1: 모노레포와 실행 가능한 기본 앱

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `apps/api/**` using Nest CLI
- Create: `apps/web/**` using Vite React TypeScript
- Modify: `apps/api/src/app.controller.ts`
- Modify: `apps/web/src/App.tsx`
- Test: `apps/api/src/app.controller.spec.ts`
- Test: `apps/web/src/App.test.tsx`

**Interfaces:**
- Produces: root commands `npm run dev`, `npm run build`, `npm test`, `npm run lint`
- Produces: `GET /api/health` returning `{ "status": "ok" }`
- Produces: web shell containing the product name `야근 기록`

- [ ] **Step 1: Scaffold both workspaces without nested installs**

```bash
npx @nestjs/cli@latest new apps/api --package-manager npm --skip-git --skip-install --strict
npm create vite@latest apps/web -- --template react-ts
```

Expected: `apps/api/package.json` and `apps/web/package.json` exist, neither workspace contains its own `node_modules` or lockfile, and dependency installation has not started.

- [ ] **Step 2: Add root workspace scripts and repository exclusions**

```json
{
  "name": "overtime-tracker",
  "private": true,
  "engines": { "node": ">=22.12.0", "npm": ">=10.9.0" },
  "workspaces": ["apps/*"],
  "scripts": {
    "dev": "concurrently -n api,web -c blue,green \"npm run start:dev -w apps/api\" \"npm run dev -w apps/web\"",
    "build": "npm run build -w apps/api && npm run build -w apps/web",
    "test": "npm run test -w apps/api -- --runInBand && npm run test -w apps/web -- --run",
    "lint": "npm run lint -w apps/api && npm run lint -w apps/web"
  },
  "devDependencies": { "concurrently": "^9.0.0" }
}
```

```gitignore
node_modules/
dist/
coverage/
.env
.env.*
!.env.example
*.sqlite
*.sqlite-shm
*.sqlite-wal
data/
backups/
```

```dotenv
NODE_ENV=development
PORT=3000
APP_ORIGIN=http://localhost:5173
DATABASE_PATH=./data/overtime.sqlite
GOOGLE_CLIENT_ID=local-google-client-id.apps.googleusercontent.com
GOOGLE_HOSTED_DOMAIN=company.com
ADMIN_EMAILS=admin@company.com
SESSION_COOKIE_NAME=overtime_session
SESSION_TTL_DAYS=7
SESSION_HASH_SECRET=replace-with-at-least-32-random-characters
```

Set the web workspace scripts to the following before installing dependencies:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "test": "vitest"
  }
}
```

Then install the entire workspace from the repository root:

```bash
npm install
npm install -D concurrently
npm install -w apps/web @tanstack/react-query react-router-dom
npm install -D -w apps/web vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Expected: one root `package-lock.json` and one root `node_modules` are created; workspace-local lockfiles do not exist.

- [ ] **Step 3: Write failing API and web shell tests**

```ts
// apps/api/src/app.controller.spec.ts
it('returns service health', () => {
  expect(controller.health()).toEqual({ status: 'ok' });
});
```

```tsx
// apps/web/src/App.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders the product name', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '야근 기록' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run the tests and confirm the new expectations fail**

Run: `npm test`

Expected: API fails because `health()` is absent and web fails because the heading is absent.

- [ ] **Step 5: Implement the minimal health route and web shell**

```ts
// apps/api/src/app.controller.ts
import { Controller, Get } from '@nestjs/common';

@Controller('api')
export class AppController {
  @Get('health')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
```

```tsx
// apps/web/src/App.tsx
export default function App() {
  return <main><h1>야근 기록</h1></main>;
}
```

Configure `apps/web/vite.config.ts` with `environment: 'jsdom'`, `setupFiles: './src/test/setup.ts'`, and a development proxy from `/api` to `http://localhost:3000`.

- [ ] **Step 6: Verify the foundation**

Run: `npm test && npm run build && npm run lint`

Expected: both test suites pass, both applications build, and lint exits successfully.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .gitignore .env.example apps/api apps/web
git commit -m "chore: scaffold overtime tracker workspaces"
```

---

### Task 2: 환경변수와 SQLite 스키마

**Files:**
- Create: `apps/api/src/config/env.schema.ts`
- Create: `apps/api/src/config/app.config.ts`
- Create: `apps/api/src/database/database.module.ts`
- Create: `apps/api/src/database/typeorm.config.ts`
- Create: `apps/api/src/database/entities/user.entity.ts`
- Create: `apps/api/src/database/entities/session.entity.ts`
- Create: `apps/api/src/database/entities/overtime-record.entity.ts`
- Create: `apps/api/src/database/migrations/0001-initial-schema.ts`
- Create: `apps/api/src/common/errors/application.error.ts`
- Create: `apps/api/src/common/http/global-exception.filter.ts`
- Create: `apps/api/src/common/http/request-id.middleware.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/config/env.schema.spec.ts`
- Test: `apps/api/src/common/http/global-exception.filter.spec.ts`
- Test: `apps/api/test/database-schema.e2e-spec.ts`

**Interfaces:**
- Produces: `Env` with `APP_ORIGIN`, `DATABASE_PATH`, `GOOGLE_CLIENT_ID`, `GOOGLE_HOSTED_DOMAIN`, `ADMIN_EMAILS`, session settings
- Produces: `UserEntity`, `SessionEntity`, `OvertimeRecordEntity`
- Produces: unique indexes for `googleSubject`, `tokenHash`; indexes for `(userId, workDate)` and `expiresAt`
- Produces: 오류 응답 `{ code: string; message: string; fieldErrors?: Record<string, string>; requestId: string }`

- [ ] **Step 1: Install configuration and persistence dependencies**

```bash
npm install -w apps/api @nestjs/config zod @nestjs/typeorm typeorm better-sqlite3
npm install -D -w apps/api @types/better-sqlite3
```

- [ ] **Step 2: Write failing environment and migration tests**

```ts
// env.schema.spec.ts
it('rejects a short session hash secret', () => {
  expect(() => parseEnv({ ...validEnv, SESSION_HASH_SECRET: 'short' })).toThrow();
});

it('normalizes comma-separated administrator emails', () => {
  expect(parseEnv({ ...validEnv, ADMIN_EMAILS: 'a@company.com, b@company.com' }).ADMIN_EMAILS)
    .toEqual(['a@company.com', 'b@company.com']);
});

it('hides unexpected exception details and includes the request id', () => {
  const response = filterResponseFor(new Error('database path /secret'));
  expect(response.body).toEqual({
    code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다', requestId: 'request-1',
  });
  expect(JSON.stringify(response.body)).not.toContain('/secret');
});
```

```ts
// database-schema.e2e-spec.ts
it('creates users, sessions, and overtime_records tables', async () => {
  const rows = await dataSource.query("SELECT name FROM sqlite_master WHERE type='table'");
  expect(rows.map((row: { name: string }) => row.name)).toEqual(
    expect.arrayContaining(['users', 'sessions', 'overtime_records']),
  );
});
```

- [ ] **Step 3: Confirm tests fail before configuration exists**

Run: `npm run test -w apps/api -- env.schema.spec.ts database-schema.e2e-spec.ts --runInBand`

Expected: FAIL with missing `parseEnv` and missing database module.

- [ ] **Step 4: Implement the environment contract**

```ts
export type Env = {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  APP_ORIGIN: string;
  DATABASE_PATH: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_HOSTED_DOMAIN: string;
  ADMIN_EMAILS: string[];
  SESSION_COOKIE_NAME: string;
  SESSION_TTL_DAYS: number;
  SESSION_HASH_SECRET: string;
};

export function parseEnv(input: NodeJS.ProcessEnv): Env {
  return envSchema.parse(input);
}
```

Use Zod transforms for integer values and lower-cased, trimmed email/domain lists. Require an HTTP localhost origin in development and an HTTPS origin in production. Require at least 32 characters for `SESSION_HASH_SECRET`.

- [ ] **Step 5: Implement entities and migration**

```ts
@Entity('overtime_records')
@Index(['userId', 'workDate'])
export class OvertimeRecordEntity {
  @PrimaryColumn('text') id!: string;
  @Column('text') userId!: string;
  @Column('text') workDate!: string;
  @Column('datetime') startAt!: Date;
  @Column('datetime') endAt!: Date;
  @Column('integer') durationMinutes!: number;
  @Column('text') reason!: string;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
```

Create corresponding `UserEntity` and `SessionEntity`, foreign keys with cascade only from user to sessions, and an explicit migration that creates all tables and indexes. Do not use `synchronize: true`; tests and runtime both run migrations.

- [ ] **Step 6: Implement the common error and request-log boundary**

```ts
export class ApplicationError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly fieldErrors?: Record<string, string>,
  ) { super(message); }
}
```

The global filter maps `ApplicationError` directly, converts validation failures to `400`, and converts unknown errors to `INTERNAL_ERROR` without exposing the original message. The request middleware accepts a valid incoming `x-request-id` or generates `crypto.randomUUID()`, returns it in the response header, and writes one JSON log containing request ID, method, path, status, and elapsed milliseconds. It must never log bodies, cookies, Google credentials, CSV contents, or environment values.

- [ ] **Step 7: Verify schema, configuration, and HTTP boundary**

Run: `npm run test -w apps/api -- env.schema.spec.ts global-exception.filter.spec.ts database-schema.e2e-spec.ts --runInBand`

Expected: PASS with three application tables, all environment cases, safe errors, and request IDs.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/config apps/api/src/database apps/api/src/common apps/api/src/app.module.ts apps/api/test
git commit -m "feat: add validated config and sqlite schema"
```

---

### Task 3: 야근 시간 도메인 규칙

**Files:**
- Create: `apps/api/src/overtime/domain/overtime-time.ts`
- Create: `apps/api/src/overtime/domain/overtime.errors.ts`
- Test: `apps/api/src/overtime/domain/overtime-time.spec.ts`

**Interfaces:**
- Produces: `buildOvertimeInterval(input: OvertimeTimeInput): OvertimeInterval`
- Produces: `intervalsOverlap(left: OvertimeInterval, right: OvertimeInterval): boolean`
- Types: `OvertimeTimeInput = { workDate: string; startTime: string; endTime: string }`
- Types: `OvertimeInterval = { startAt: Date; endAt: Date; durationMinutes: number }`

- [ ] **Step 1: Install a timezone-aware date library**

```bash
npm install -w apps/api luxon
npm install -D -w apps/api @types/luxon
```

- [ ] **Step 2: Write complete failing boundary tests**

```ts
it.each([
  [{ workDate: '2026-07-13', startTime: '18:00', endTime: '20:30' }, 150],
  [{ workDate: '2026-07-13', startTime: '22:00', endTime: '01:30' }, 210],
])('calculates Korean overtime %#', (input, expected) => {
  expect(buildOvertimeInterval(input).durationMinutes).toBe(expected);
});

it.each([
  { workDate: '2026-07-13', startTime: '18:00', endTime: '18:00' },
  { workDate: '2026-07-13', startTime: '18:00', endTime: '10:01' },
  { workDate: '2026-02-30', startTime: '18:00', endTime: '20:00' },
  { workDate: '2026-07-13', startTime: '24:00', endTime: '01:00' },
])('rejects invalid interval %#', (input) => {
  expect(() => buildOvertimeInterval(input)).toThrow(InvalidOvertimeTimeError);
});

function interval(startTime: string, endTime: string): OvertimeInterval {
  return buildOvertimeInterval({ workDate: '2026-07-13', startTime, endTime });
}

it('treats touching intervals as non-overlapping', () => {
  expect(intervalsOverlap(interval('18:00', '20:00'), interval('20:00', '21:00'))).toBe(false);
});
```

- [ ] **Step 3: Run tests and confirm failure**

Run: `npm run test -w apps/api -- overtime-time.spec.ts --runInBand`

Expected: FAIL because domain functions do not exist.

- [ ] **Step 4: Implement Korean-time parsing and overlap**

```ts
const SEOUL = 'Asia/Seoul';

export function buildOvertimeInterval(input: OvertimeTimeInput): OvertimeInterval {
  const start = DateTime.fromISO(`${input.workDate}T${input.startTime}`, { zone: SEOUL });
  let end = DateTime.fromISO(`${input.workDate}T${input.endTime}`, { zone: SEOUL });
  if (!start.isValid || !end.isValid || !DATE.test(input.workDate) || !TIME.test(input.startTime) || !TIME.test(input.endTime)) {
    throw new InvalidOvertimeTimeError();
  }
  if (end < start) end = end.plus({ days: 1 });
  const durationMinutes = end.diff(start, 'minutes').minutes;
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0 || durationMinutes > 960) {
    throw new InvalidOvertimeTimeError();
  }
  return { startAt: start.toUTC().toJSDate(), endAt: end.toUTC().toJSDate(), durationMinutes };
}

export function intervalsOverlap(a: OvertimeInterval, b: OvertimeInterval): boolean {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}
```

- [ ] **Step 5: Verify all domain boundaries pass**

Run: `npm run test -w apps/api -- overtime-time.spec.ts --runInBand`

Expected: PASS for normal, midnight, invalid, maximum-duration, and overlap cases.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/overtime/domain
git commit -m "feat: define overtime time rules"
```

---

### Task 4: Google 로그인과 안전한 서버 세션

**Files:**
- Create: `apps/api/src/users/users.repository.ts`
- Create: `apps/api/src/users/typeorm-users.repository.ts`
- Create: `apps/api/src/auth/google-verifier.ts`
- Create: `apps/api/src/auth/google-auth-library.verifier.ts`
- Create: `apps/api/src/auth/session.repository.ts`
- Create: `apps/api/src/auth/typeorm-session.repository.ts`
- Create: `apps/api/src/auth/auth.service.ts`
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/session.guard.ts`
- Create: `apps/api/src/auth/origin.guard.ts`
- Create: `apps/api/src/common/current-user.ts`
- Create: `apps/api/src/auth/auth.module.ts`
- Test: `apps/api/src/auth/auth.service.spec.ts`
- Test: `apps/api/test/auth.e2e-spec.ts`

**Interfaces:**
- Consumes: `UserEntity`, `SessionEntity`, parsed `Env`
- Produces: `GoogleVerifier.verify(credential: string): Promise<VerifiedGoogleIdentity>`
- Produces: `VerifiedGoogleIdentity = { subject: string; email: string; name: string; pictureUrl?: string; hostedDomain: string }`
- Produces: `AuthService.signInWithGoogle(credential: string): Promise<{ user: AuthUser; sessionToken: string }>`
- Produces: request property `request.authUser: AuthUser`
- Produces: `AuthUser = { id: string; email: string; name: string; isAdmin: boolean }`

- [ ] **Step 1: Install Google verification and cookie dependencies**

```bash
npm install -w apps/api google-auth-library cookie-parser
npm install -D -w apps/api @types/cookie-parser
```

- [ ] **Step 2: Write failing service tests for domain, hashing, and administrator derivation**

```ts
it('rejects an identity outside the configured hosted domain', async () => {
  google.verify.mockResolvedValue(identity({ hostedDomain: 'other.com' }));
  await expect(service.signInWithGoogle('credential')).rejects.toBeInstanceOf(ForbiddenCompanyAccountError);
});

it('stores only a hash of the session token', async () => {
  const result = await service.signInWithGoogle('credential');
  expect(result.sessionToken).toHaveLength(64);
  expect(sessions.create).toHaveBeenCalledWith(expect.objectContaining({
    tokenHash: expect.not.stringContaining(result.sessionToken),
  }));
});

it('derives administrator status from the configured email allowlist', async () => {
  expect(await service.resolveSession(validToken)).toMatchObject({ email: 'admin@company.com', isAdmin: true });
});
```

- [ ] **Step 3: Confirm authentication tests fail**

Run: `npm run test -w apps/api -- auth.service.spec.ts --runInBand`

Expected: FAIL because auth interfaces and service are absent.

- [ ] **Step 4: Implement Google verifier, repositories, token hashing, and session resolution**

```ts
export interface GoogleVerifier {
  verify(credential: string): Promise<VerifiedGoogleIdentity>;
}

export function hashSessionToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}

export function newSessionToken(): string {
  return randomBytes(32).toString('hex');
}
```

The Google adapter calls `OAuth2Client.verifyIdToken`, requires `sub`, `email`, `email_verified`, and `hd`, and maps optional `name` and `picture`. The service lower-cases email and domain, upserts the user by `googleSubject`, creates a seven-day session, and never logs the credential or raw token.

- [ ] **Step 5: Implement controller, guards, and cookie lifecycle**

```ts
@Post('google')
async google(@Body() body: GoogleLoginDto, @Res({ passthrough: true }) response: Response) {
  const result = await this.auth.signInWithGoogle(body.credential);
  response.cookie(this.cookieName, result.sessionToken, this.cookieOptions);
  return { user: result.user };
}
```

`SessionGuard` reads the configured cookie, resolves the hashed session, rejects expired sessions with `401`, and assigns `request.authUser`. `OriginGuard` requires an exact `Origin === APP_ORIGIN` for `POST`, `PATCH`, `PUT`, and `DELETE`. Logout revokes the current token hash before clearing the cookie.

- [ ] **Step 6: Add API integration tests**

Cover successful login, wrong `hd`, missing/expired session, `GET /api/auth/me`, logout revocation, unsafe origin, and secure cookie flags in production by overriding `GoogleVerifier` with a deterministic fake.

Run: `npm run test:e2e -w apps/api -- auth.e2e-spec.ts --runInBand`

Expected: PASS and `Set-Cookie` contains `HttpOnly` and `SameSite=Lax`; production configuration also contains `Secure`.

- [ ] **Step 7: Run all API tests and commit**

```bash
npm run test -w apps/api -- --runInBand
npm run test:e2e -w apps/api -- --runInBand
git add apps/api/src/auth apps/api/src/users apps/api/src/common apps/api/src/main.ts apps/api/test
git commit -m "feat: add Google authentication and server sessions"
```

Expected: all API unit and integration tests pass.

---

### Task 5: 직원 야근 기록 API

**Files:**
- Create: `apps/api/src/overtime/overtime.repository.ts`
- Create: `apps/api/src/overtime/typeorm-overtime.repository.ts`
- Create: `apps/api/src/overtime/dto/create-overtime.dto.ts`
- Create: `apps/api/src/overtime/dto/update-overtime.dto.ts`
- Create: `apps/api/src/overtime/overtime.service.ts`
- Create: `apps/api/src/overtime/overtime.controller.ts`
- Create: `apps/api/src/overtime/overtime.module.ts`
- Test: `apps/api/src/overtime/overtime.service.spec.ts`
- Test: `apps/api/test/overtime.e2e-spec.ts`

**Interfaces:**
- Consumes: `AuthUser`, `buildOvertimeInterval`, `OvertimeRecordEntity`
- Produces: `OvertimeService.listMine(userId: string, month: string): Promise<MonthlyOvertime>`
- Produces: `OvertimeService.create(userId: string, input: SaveOvertimeInput): Promise<OvertimeView>`
- Produces: `OvertimeService.update(userId: string, id: string, input: SaveOvertimeInput): Promise<OvertimeView>`
- Produces: `OvertimeService.remove(userId: string, id: string): Promise<void>`
- Types: `SaveOvertimeInput = { workDate: string; startTime: string; endTime: string; reason: string }`
- Types: `OvertimeView = { id: string; workDate: string; startTime: string; endTime: string; durationMinutes: number; reason: string; createdAt: string; updatedAt: string }`
- Types: `MonthlyOvertime = { month: string; totalMinutes: number; records: OvertimeView[] }`

- [ ] **Step 1: Install DTO validation helpers**

```bash
npm install -w apps/api class-validator class-transformer
```

- [ ] **Step 2: Write failing service tests**

```ts
it('calculates duration on the server and trims the reason', async () => {
  const result = await service.create(userId, {
    workDate: '2026-07-13', startTime: '22:00', endTime: '01:30', reason: '  배포 대응  ',
  });
  expect(result).toMatchObject({ durationMinutes: 210, reason: '배포 대응' });
});

it('rejects overlap with another owned record', async () => {
  repository.findOverlapping.mockResolvedValue(existingRecord);
  await expect(service.create(userId, validInput)).rejects.toBeInstanceOf(OvertimeOverlapError);
});

it('hides another employee record as not found', async () => {
  repository.findOwnedById.mockResolvedValue(null);
  await expect(service.update(userId, otherId, validInput)).rejects.toBeInstanceOf(OvertimeNotFoundError);
});
```

- [ ] **Step 3: Confirm overtime tests fail**

Run: `npm run test -w apps/api -- overtime.service.spec.ts --runInBand`

Expected: FAIL because repository and service do not exist.

- [ ] **Step 4: Implement repository and transaction-safe service**

```ts
export interface OvertimeRepository {
  listByUserAndWorkDateRange(userId: string, from: string, toExclusive: string): Promise<OvertimeRecordEntity[]>;
  findOwnedById(userId: string, id: string): Promise<OvertimeRecordEntity | null>;
  findOverlapping(userId: string, startAt: Date, endAt: Date, excludeId?: string): Promise<OvertimeRecordEntity | null>;
  save(record: OvertimeRecordEntity): Promise<OvertimeRecordEntity>;
  remove(record: OvertimeRecordEntity): Promise<void>;
}
```

Create and update execute overlap lookup and save inside one TypeORM transaction. Validate `month` with `^\\d{4}-(0[1-9]|1[0-2])$`, trim reason, enforce 1-500 characters, and generate UUIDs with `crypto.randomUUID()`.

- [ ] **Step 5: Implement protected controller and response mapping**

```ts
@UseGuards(SessionGuard)
@Controller('api/overtime')
export class OvertimeController {
  @Get() list(@CurrentUser() user: AuthUser, @Query('month') month: string) {
    return this.service.listMine(user.id, month);
  }
}
```

Add `POST`, `PATCH :id`, and `DELETE :id`. Return `201` for create, `200` for update/list, and `204` for delete. Map invalid input to `400`, absent ownership to `404`, and overlap to `409` through the global exception filter.

- [ ] **Step 6: Add integration tests and verify**

Test midnight creation, current-user filtering, another user's update/delete, overlap, invalid month, reason length, and monthly total.

Run: `npm run test:e2e -w apps/api -- overtime.e2e-spec.ts --runInBand`

Expected: all CRUD, ownership, validation, and total cases pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/overtime apps/api/src/common apps/api/test/overtime.e2e-spec.ts
git commit -m "feat: add employee overtime API"
```

---

### Task 6: 직원용 모바일 웹

**Files:**
- Create: `apps/web/src/api/http.ts`
- Create: `apps/web/src/api/types.ts`
- Create: `apps/web/src/auth/AuthProvider.tsx`
- Create: `apps/web/src/auth/LoginPage.tsx`
- Create: `apps/web/src/auth/GoogleSignInButton.tsx`
- Create: `apps/web/src/overtime/OvertimePage.tsx`
- Create: `apps/web/src/overtime/OvertimeForm.tsx`
- Create: `apps/web/src/overtime/OvertimeList.tsx`
- Create: `apps/web/src/overtime/time-preview.ts`
- Create: `apps/web/src/app/router.tsx`
- Create: `apps/web/src/styles/global.css`
- Test: `apps/web/src/overtime/OvertimeForm.test.tsx`
- Test: `apps/web/src/overtime/OvertimePage.test.tsx`

**Interfaces:**
- Consumes: authentication and employee API contracts from Tasks 4-5
- Produces: `api<T>(path: string, init?: RequestInit): Promise<T>` with credentials included
- Produces: `OvertimeFormValues = { workDate: string; startTime: string; endTime: string; reason: string }`
- Produces: `ApiError = { status: number; code: string; message: string; fieldErrors?: Record<string, string> }` and a distinct `SessionExpiredError`
- Produces: responsive routes `/login` and `/`

- [ ] **Step 1: Install the browser API test server**

```bash
npm install -D -w apps/web msw
```

Create `apps/web/src/test/server.ts` with `setupServer()` and register `server.listen()`, `server.resetHandlers()`, and `server.close()` in `apps/web/src/test/setup.ts` so every browser test starts with isolated request handlers.

- [ ] **Step 2: Write failing form and page tests**

```tsx
it('keeps entered values when save fails', async () => {
  server.use(http.post('/api/overtime', () => HttpResponse.json({ code: 'NETWORK' }, { status: 500 })));
  render(<OvertimeForm onSaved={vi.fn()} />);
  await user.type(screen.getByLabelText('야근 사유'), '배포 대응');
  await user.click(screen.getByRole('button', { name: '저장' }));
  expect(screen.getByLabelText('야근 사유')).toHaveValue('배포 대응');
  expect(screen.getByRole('alert')).toHaveTextContent('잠시 후 다시 시도해주세요');
});

it('shows an empty state for a month without records', async () => {
  renderOvertimePage({ records: [], totalMinutes: 0 });
  expect(await screen.findByText('이번 달 야근 기록이 없습니다')).toBeInTheDocument();
});
```

- [ ] **Step 3: Run web tests and confirm failure**

Run: `npm run test -w apps/web -- --run OvertimeForm.test.tsx OvertimePage.test.tsx`

Expected: FAIL because employee UI does not exist.

- [ ] **Step 4: Implement API client, authentication provider, and Google button**

```ts
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (response.status === 401) throw new SessionExpiredError();
  if (!response.ok) throw await ApiError.fromResponse(response);
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
```

Load `/api/auth/me` once in `AuthProvider`. Configure Google Identity Services with `VITE_GOOGLE_CLIENT_ID`, send the credential to `/api/auth/google`, and invalidate the current-user query. Show a specific company-account message for `403`.

- [ ] **Step 5: Implement mobile record page, form, list, and accessible states**

Use native `date` and `time` inputs, keep local form state until a successful mutation, show a client preview calculated with the same midnight rule, and always display the server result after save. Add edit and delete controls with a delete confirmation. Use CSS with a single-column layout below 768px, 44px minimum tap targets, visible focus styles, and readable error text.

- [ ] **Step 6: Verify employee web behavior**

Run: `npm run test -w apps/web -- --run && npm run build -w apps/web && npm run lint -w apps/web`

Expected: login, loading, empty, create, edit, delete, network-error preservation, and session-expiry tests pass; build and lint succeed.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat: add mobile employee overtime experience"
```

---

### Task 7: 관리자 집계와 안전한 CSV API

**Files:**
- Create: `apps/api/src/common/admin.guard.ts`
- Create: `apps/api/src/reports/reports.repository.ts`
- Create: `apps/api/src/reports/typeorm-reports.repository.ts`
- Create: `apps/api/src/reports/reports.service.ts`
- Create: `apps/api/src/reports/csv.ts`
- Create: `apps/api/src/reports/reports.controller.ts`
- Create: `apps/api/src/reports/reports.module.ts`
- Test: `apps/api/src/reports/csv.spec.ts`
- Test: `apps/api/src/reports/reports.service.spec.ts`
- Test: `apps/api/test/admin-reports.e2e-spec.ts`

**Interfaces:**
- Consumes: `AuthUser.isAdmin`, `OvertimeRecordEntity`, `UserEntity`
- Produces: `ReportsService.listUsers(): Promise<AdminUserView[]>`
- Produces: `ReportsService.monthly(query: MonthlyReportQuery): Promise<MonthlyAdminReport>`
- Produces: `ReportsService.csv(query: MonthlyReportQuery): Promise<string>`
- Types: `MonthlyReportQuery = { month: string; userId?: string }`
- Types: `AdminUserView = { id: string; name: string; email: string }`
- Types: `AdminOvertimeRow = OvertimeView & { user: AdminUserView }`
- Types: `MonthlyAdminReport = { month: string; userId?: string; totalMinutes: number; totalsByUser: Array<{ user: AdminUserView; totalMinutes: number }>; records: AdminOvertimeRow[] }`

- [ ] **Step 1: Write failing administrator and CSV security tests**

```ts
it.each(['=1+1', '+cmd', '-2+3', '@SUM(A1:A2)'])('neutralizes formula value %s', (value) => {
  expect(csvCell(value)).toBe(`'${value}`);
});

it('adds a UTF-8 BOM and escapes quotes', () => {
  expect(buildCsv([{ reason: '긴급, "배포"' }])).toMatch(/^\uFEFF/);
  expect(buildCsv([{ reason: '긴급, "배포"' }])).toContain('"긴급, ""배포"""');
});
```

Add service tests asserting employee and total minutes, optional `userId`, Korean `workDate` range, and exact equality between JSON and CSV filtered rows.

- [ ] **Step 2: Confirm report tests fail**

Run: `npm run test -w apps/api -- csv.spec.ts reports.service.spec.ts --runInBand`

Expected: FAIL because report functions do not exist.

- [ ] **Step 3: Implement administrator guard, report query, and CSV**

```ts
export function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
```

The report repository joins users and overtime records, filters by `[monthStart, nextMonthStart)`, optionally filters one user, and orders by `workDate`, `startAt`, then user name. Compute per-user and overall totals from the exact returned rows.

- [ ] **Step 4: Implement administrator endpoints**

Apply `SessionGuard` and `AdminGuard` to the controller. Return CSV with:

```http
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="overtime-2026-07.csv"
```

- [ ] **Step 5: Run integration tests**

Cover `403` for employees, all-user and single-user filters, invalid UUID/month, totals, UTF-8 BOM, formula neutralization, and identical filter behavior.

Run: `npm run test:e2e -w apps/api -- admin-reports.e2e-spec.ts --runInBand`

Expected: all authorization, aggregation, and CSV cases pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/common/admin.guard.ts apps/api/src/reports apps/api/test/admin-reports.e2e-spec.ts
git commit -m "feat: add administrator reports and csv export"
```

---

### Task 8: 관리자 웹 화면

**Files:**
- Create: `apps/web/src/admin/AdminPage.tsx`
- Create: `apps/web/src/admin/AdminFilters.tsx`
- Create: `apps/web/src/admin/AdminSummary.tsx`
- Create: `apps/web/src/admin/AdminTable.tsx`
- Create: `apps/web/src/admin/csv-download.ts`
- Modify: `apps/web/src/app/router.tsx`
- Test: `apps/web/src/admin/AdminPage.test.tsx`
- Test: `apps/web/src/admin/csv-download.test.ts`

**Interfaces:**
- Consumes: `GET /api/admin/users`, `GET /api/admin/overtime`, CSV endpoint
- Produces: protected route `/admin`
- Produces: `buildCsvUrl({ month, userId? }): string`

- [ ] **Step 1: Write failing role, filter, and download tests**

```tsx
it('keeps the CSV URL synchronized with active filters', async () => {
  renderAdminPage({ month: '2026-07', selectedUserId: 'user-1' });
  expect(await screen.findByRole('link', { name: 'CSV 다운로드' }))
    .toHaveAttribute('href', '/api/admin/reports.csv?month=2026-07&userId=user-1');
});

it('does not show the admin route to an employee', () => {
  renderRouter({ user: { isAdmin: false } }, '/admin');
  expect(screen.getByText('접근 권한이 없습니다')).toBeInTheDocument();
});
```

- [ ] **Step 2: Confirm administrator web tests fail**

Run: `npm run test -w apps/web -- --run AdminPage.test.tsx csv-download.test.ts`

Expected: FAIL because administrator components do not exist.

- [ ] **Step 3: Implement filters, summary, table, and CSV link**

Use URL search parameters as the source of truth for `month` and optional `userId`. Refetch the JSON report whenever they change. Display overall minutes as hours and minutes without rounding, preserve raw minutes in accessible text, and allow horizontal table scrolling on small screens.

```ts
export function buildCsvUrl(query: { month: string; userId?: string }): string {
  const params = new URLSearchParams({ month: query.month });
  if (query.userId) params.set('userId', query.userId);
  return `/api/admin/reports.csv?${params}`;
}
```

- [ ] **Step 4: Verify administrator web behavior and commit**

```bash
npm run test -w apps/web -- --run
npm run build -w apps/web
npm run lint -w apps/web
git add apps/web/src/admin apps/web/src/app/router.tsx
git commit -m "feat: add administrator overtime dashboard"
```

Expected: role protection, loading, empty, filtering, totals, table, and CSV URL tests pass.

---

### Task 9: 운영 Docker 이미지와 로컬 운영형 검증

**Files:**
- Create: `docker/api.Dockerfile`
- Create: `docker/web.Dockerfile`
- Create: `docker/Caddyfile`
- Create: `compose.yaml`
- Create: `compose.production.yaml`
- Create: `apps/api/src/health/health.controller.ts`
- Create: `apps/api/src/health/health.service.ts`
- Create: `apps/api/src/health/health.module.ts`
- Test: `apps/api/test/health.e2e-spec.ts`
- Create: `docs/runbooks/local-development.md`

**Interfaces:**
- Produces: images `overtime-api` and `overtime-web`
- Produces: container health endpoint `/api/health`
- Produces: persistent mount `/data/overtime:/app/data`

- [ ] **Step 1: Write a failing database-readiness test**

```ts
it('reports database readiness', async () => {
  await request(app.getHttpServer())
    .get('/api/health')
    .expect(200)
    .expect({ status: 'ok', database: 'ready' });
});
```

Run: `npm run test:e2e -w apps/api -- health.e2e-spec.ts --runInBand`

Expected: FAIL because the current health route does not query SQLite.

- [ ] **Step 2: Implement readiness and multi-stage images**

The health service runs `SELECT 1` through the TypeORM DataSource and returns `503` with `{ status: 'unavailable', database: 'unavailable' }` on failure without returning driver details.

```dockerfile
# docker/api.Dockerfile
FROM node:22-bookworm-slim AS build
WORKDIR /workspace
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci -w apps/api --include-workspace-root
COPY apps/api apps/api
RUN npm run build -w apps/api
RUN npm prune --omit=dev -w apps/api --include-workspace-root

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api/dist ./dist
COPY --from=build /workspace/apps/api/package.json ./package.json
RUN useradd --system --uid 10001 app && mkdir -p /app/data && chown -R app:app /app
USER app
CMD ["node", "dist/main.js"]
```

The web Dockerfile builds Vite assets and copies `dist` into a pinned Caddy runtime image. The Caddyfile serves SPA fallback and reverse-proxies `/api/*` to `api:3000` without stripping `/api`.

- [ ] **Step 3: Define Compose persistence, health checks, and log limits**

```yaml
services:
  api:
    build:
      context: .
      dockerfile: docker/api.Dockerfile
    env_file: .env
    volumes:
      - ${OVERTIME_DATA_DIR:-./data}:/app/data
    restart: unless-stopped
    logging:
      options: { max-size: "10m", max-file: "3" }
  web:
    build:
      context: .
      dockerfile: docker/web.Dockerfile
    ports: ["8080:80"]
    depends_on:
      api: { condition: service_healthy }
```

- [ ] **Step 4: Build, start, and verify persistence**

Run:

```bash
docker compose build
docker compose up -d
curl --fail http://localhost:8080/api/health
docker compose restart api
curl --fail http://localhost:8080/api/health
docker compose down
```

Expected: both health calls return `{"status":"ok","database":"ready"}` and `data/overtime.sqlite` remains after `down`.

- [ ] **Step 5: Document local setup and commit**

Document `.env` creation, Google localhost origin, migrations, start/stop, tests, and database reset commands with warnings that reset deletes local data only.

```bash
git add docker compose.yaml compose.production.yaml apps/api/src/health apps/api/test/health.e2e-spec.ts docs/runbooks/local-development.md
git commit -m "feat: add production-style Docker runtime"
```

---

### Task 10: 백업·CI·GCP 배포 문서

**Files:**
- Create: `docker/backup.sh`
- Create: `docker/restore.sh`
- Create: `.github/workflows/ci.yml`
- Create: `docs/runbooks/backup-restore.md`
- Create: `docs/runbooks/gcp-deployment.md`
- Modify: `README.md`
- Test: `docker/backup-restore.test.sh`

**Interfaces:**
- Consumes: mounted SQLite database and GCP service account
- Produces: timestamped consistent `.sqlite` backups and Cloud Storage upload
- Produces: CI checks for test, lint, build, and Docker build
- Produces: complete GCP provisioning and final domain activation runbooks

- [ ] **Step 1: Write a failing backup and restore smoke test**

```bash
#!/usr/bin/env bash
set -euo pipefail
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
sqlite3 "$tmp/source.sqlite" 'create table probe(value text); insert into probe values("kept");'
DATABASE_PATH="$tmp/source.sqlite" BACKUP_DIR="$tmp/backups" SKIP_UPLOAD=1 ./docker/backup.sh
backup="$(find "$tmp/backups" -name '*.sqlite' -type f | head -1)"
RESTORE_SOURCE="$backup" RESTORE_TARGET="$tmp/restored.sqlite" ./docker/restore.sh
test "$(sqlite3 "$tmp/restored.sqlite" 'select value from probe;')" = "kept"
```

Run: `bash docker/backup-restore.test.sh`

Expected: FAIL because backup and restore scripts do not exist.

- [ ] **Step 2: Implement transactionally consistent backup and guarded restore**

```bash
# backup core
mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_DIR/overtime-$timestamp.sqlite"
sqlite3 "$DATABASE_PATH" ".backup '$target'"
sqlite3 "$target" 'PRAGMA integrity_check;' | grep -qx 'ok'
if [[ "${SKIP_UPLOAD:-0}" != "1" ]]; then
  gcloud storage cp "$target" "gs://$BACKUP_BUCKET/"
fi
```

The restore script refuses to overwrite an existing target unless `CONFIRM_RESTORE=YES`, copies to a temporary file, verifies `PRAGMA integrity_check`, then atomically renames it. It prints the exact service stop, restore, and restart order in `--help`.

- [ ] **Step 3: Run backup test and shell syntax checks**

Run: `bash -n docker/backup.sh docker/restore.sh docker/backup-restore.test.sh && bash docker/backup-restore.test.sh`

Expected: syntax checks pass and restored probe value equals `kept`.

- [ ] **Step 4: Add CI with exact quality gates**

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with: { node-version: "22.12.0", cache: "npm" }
  - run: sudo apt-get update && sudo apt-get install -y sqlite3
  - run: npm ci
  - run: npm run lint
  - run: npm test
  - run: npm run build
  - run: docker build -f docker/api.Dockerfile .
  - run: docker build -f docker/web.Dockerfile .
  - run: bash docker/backup-restore.test.sh
```

Keep Artifact Registry push in a separately protected deployment job using Workload Identity Federation; do not store a long-lived GCP key in GitHub secrets.

- [ ] **Step 5: Write exact GCP and domain runbooks**

The GCP runbook must include:

- eligible US free-tier region and `e2-micro` selection
- standard Persistent Disk creation and `delete-auto=false`
- filesystem mount at `/data/overtime`
- least-privilege VM service account and Artifact Registry pull
- firewall ports 80/443 only; SSH access restrictions
- Docker Engine and Compose installation
- production `.env` creation with a generated 32-byte-or-longer secret
- Compose deployment, migration, health check, rollback, and log inspection
- private Cloud Storage bucket, retention/lifecycle, scheduled backup, and restore drill
- budget alerts and explicit warning that free-tier limits do not guarantee zero cost
- pending domain steps: DNS, Caddy HTTPS, exact Google origin, and company-internal OAuth setting

- [ ] **Step 6: Run final verification**

Run:

```bash
npm run lint
npm test
npm run build
docker compose build
bash docker/backup-restore.test.sh
git status --short
```

Expected: lint, unit/integration/web tests, builds, Docker builds, and backup/restore pass. Git status shows only the Task 10 files before commit.

- [ ] **Step 7: Commit**

```bash
git add docker/backup.sh docker/restore.sh docker/backup-restore.test.sh .github/workflows/ci.yml docs/runbooks README.md
git commit -m "docs: add deployment and recovery workflow"
```

---

## 전체 완료 검증

모든 작업이 끝난 뒤 새 로컬 환경에서 다음 순서로 최종 검증한다.

```bash
npm ci
npm run lint
npm test
npm run build
docker compose build
docker compose up -d
curl --fail http://localhost:8080/api/health
bash docker/backup-restore.test.sh
docker compose down
git status --short
```

기대 결과:

- 모든 정적 검사와 테스트가 통과한다.
- React와 NestJS가 빌드된다.
- Docker 컨테이너가 정상 상태로 시작한다.
- SQLite 데이터가 API 컨테이너 교체 후에도 유지된다.
- 백업 파일을 깨끗한 SQLite 파일로 복구할 수 있다.
- 작업 트리에 미커밋 변경이 없다.
