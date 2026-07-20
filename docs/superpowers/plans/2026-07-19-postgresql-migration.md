# PostgreSQL Production Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영 중인 AIMS 추가근무 서비스의 사용자와 추가근무 기록을 보존하면서 SQLite를 동일 Oracle VM의 PostgreSQL로 전환하고, 6시간 간격 외부 백업과 주간 자동 복구 검증을 구축한다.

**Architecture:** NestJS API는 내부 Compose 네트워크의 PostgreSQL 17에 런타임 전용 계정으로 접속하고, 스키마 변경은 별도 migration 계정과 명시적 명령으로만 수행한다. 운영 DB 포트는 호스트에 공개하지 않으며 `/data/postgres`에 영속화한다. SQLite는 일회성 읽기 전용 이관 소스와 30일 롤백 증거로만 남기고, PostgreSQL 백업은 `pg_dump -Fc`로 생성·검증한 뒤 OCI Object Storage에 업로드한다.

**Tech Stack:** NestJS 11, TypeORM 0.3, PostgreSQL 17.10 Bookworm, `pg`, `better-sqlite3`(이관 도구 전용), Docker Compose, Jest, Bash, systemd, OCI CLI/Object Storage

## Global Constraints

- 운영 URL은 `https://aims-overtime.duckdns.org`이며 사용자 화면과 API 동작은 바꾸지 않는다.
- 운영 SQLite 원본 `/data/overtime/overtime.sqlite`는 어떤 구현·리허설 단계에서도 수정하거나 삭제하지 않는다.
- 실제 운영 전환은 Tasks 1–10의 자동 검증과 로컬 리허설이 모두 통과한 뒤, 사용자가 유지보수 시작을 명시적으로 승인한 경우에만 수행한다.
- 운영 전환 중 API를 먼저 중지하고, 정합성 검증을 통과한 읽기 전용 SQLite 스냅샷만 이관 소스로 사용한다.
- 사용자와 추가근무 기록만 이관한다. 세션은 이관하지 않으며 모든 사용자는 다시 로그인한다.
- PostgreSQL이 외부로 노출되지 않도록 운영 Compose에 `ports`를 선언하지 않고 OCI/호스트 방화벽에도 5432 규칙을 추가하지 않는다.
- API 런타임 계정은 테이블 DML만 허용하고 schema/database 생성·삭제 권한을 갖지 않는다. migration 계정은 application schema owner이지만 superuser가 아니다. 백업 계정은 읽기 전용이다.
- 운영 API 시작 시 migration을 자동 실행하지 않는다. `synchronize: false`, `migrationsRun: false`를 유지한다.
- 비밀번호와 실제 connection URL은 Git, 문서, 로그, 테스트 스냅샷, 명령 출력에 남기지 않는다. 예시 파일에는 빈 값 또는 명백한 가짜 값만 둔다.
- PostgreSQL 데이터는 `/data/postgres`, 로컬 백업은 `/data/overtime/postgres-backups`, SQLite 최종 스냅샷은 `/data/overtime/sqlite-archive`에 둔다.
- PostgreSQL 백업은 6시간마다 실행하고 로컬 2일, OCI Object Storage 30일 보존을 목표로 한다.
- 운영 데이터 검증을 위해 가짜 기록을 생성하거나 기존 기록을 삭제하지 않는다. CRUD는 격리된 E2E DB에서만 검증한다.
- 서비스 재개 전까지만 SQLite로 롤백할 수 있다. PostgreSQL에서 첫 쓰기를 받은 뒤에는 SQLite로 단순 롤백하지 않는다.
- 사용자 소유의 추적되지 않은 `apps/coupang-ledger/` 디렉터리는 열거나 수정하거나 stage하지 않는다.

---

## File Structure

- Modify: `apps/api/package.json` — PostgreSQL driver와 DB 명령을 추가한다.
- Modify: `package.json`, `package-lock.json` — PostgreSQL 통합 테스트 실행 경로와 잠금 파일을 갱신한다.
- Modify: `.env.example`, `deploy/oracle/production.env.example` — `DATABASE_URL`과 역할별 비밀값 계약을 문서화한다.
- Modify: `apps/api/src/config/env.schema.ts`, `apps/api/src/config/env.schema.spec.ts` — 런타임 PostgreSQL URL을 검증한다.
- Create: `apps/api/src/config/migration-env.schema.ts`, `apps/api/src/config/migration-env.schema.spec.ts` — 별도 migration URL과 SQLite 소스 인자를 검증한다.
- Modify: `apps/api/src/database/typeorm.config.ts`, `apps/api/src/database/database.module.ts` — PostgreSQL 옵션을 사용하고 자동 migration을 끈다.
- Modify: `apps/api/src/database/entities/*.entity.ts` — snake_case, uuid, timestamptz, date 타입을 명시한다.
- Replace: `apps/api/src/database/migrations/0001-initial-schema.ts` — PostgreSQL 초기 스키마를 생성한다.
- Create: `apps/api/src/database/migration-data-source.ts`, `apps/api/src/database/run-migrations.ts` — migration 계정으로만 스키마를 변경한다.
- Create: `compose.test.yaml` — 로컬/E2E 전용 PostgreSQL을 제공한다.
- Create: `apps/api/test/postgres-global-setup.ts`, `apps/api/test/postgres-global-teardown.ts`, `apps/api/test/reset-postgres.ts` — 실제 PostgreSQL E2E 격리를 제공한다.
- Modify: `apps/api/test/setup-env.ts`, `apps/api/test/jest-e2e.json`, `apps/api/test/database-schema.e2e-spec.ts` — SQLite 의존 테스트를 제거한다.
- Create: `apps/api/src/database/sqlite-migration/*.ts` — 검증 가능한 일회성 SQLite→PostgreSQL 이관 라이브러리와 CLI를 구현한다.
- Create: `apps/api/src/database/sqlite-migration/*.spec.ts` — 정상/실패/세션 제외/비어 있지 않은 대상 거부를 검증한다.
- Create: `docker/postgres/init-roles.sh` — migration, runtime, backup 역할을 최초 초기화한다.
- Modify: `compose.yaml`, `compose.production.yaml` — PostgreSQL 서비스, health gate, 영속화, 메모리 제한을 추가한다.
- Modify: `deploy/oracle/compose-config.test.sh` — 5432 비노출과 데이터 경로, health gate를 검증한다.
- Create: `docker/postgres-backup.sh`, `docker/postgres-backup-oci.sh`, `docker/postgres-restore-drill.sh` — PostgreSQL 백업·업로드·임시 복구 훈련을 수행한다.
- Replace: `docker/backup-restore.test.sh` — PostgreSQL archive, checksum, OCI 호출, 복구 대상을 검증한다.
- Modify: `deploy/oracle/overtime-backup.service`, `deploy/oracle/overtime-backup.timer` — 6시간 간격 PostgreSQL 백업으로 전환한다.
- Create: `deploy/oracle/overtime-restore-drill.service`, `deploy/oracle/overtime-restore-drill.timer` — 주간 임시 복구 검증을 예약한다.
- Modify: `deploy/oracle/systemd-units.test.sh`, `deploy/oracle/runbook-restore.test.sh` — 새 unit과 복구 안전장치를 검증한다.
- Modify: `docker/api.Dockerfile` — PostgreSQL 런타임과 이관 CLI가 포함되는지 확인한다.
- Modify: `docs/runbooks/local-development.md`, `docs/runbooks/backup-restore.md`, `docs/runbooks/oracle-deployment.md`, `README.md` — 개발, 배포, 백업, 복구, 롤백 절차를 갱신한다.

---

### Task 1: PostgreSQL 환경 계약과 TypeORM 연결 옵션

**Files:**
- Modify: `apps/api/package.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`
- Modify: `apps/api/src/config/env.schema.ts`
- Modify: `apps/api/src/config/env.schema.spec.ts`
- Create: `apps/api/src/config/migration-env.schema.ts`
- Create: `apps/api/src/config/migration-env.schema.spec.ts`
- Modify: `apps/api/src/database/typeorm.config.ts`
- Modify: `apps/api/src/database/database.module.ts`

**Interfaces:**
- `createTypeOrmOptions(databaseUrl: string): PostgresConnectionOptions`
- Runtime input: `DATABASE_URL=postgresql://...`
- Migration input: `DATABASE_MIGRATION_URL=postgresql://...`
- Invariant: `synchronize === false`, `migrationsRun === false`, TLS is controlled only through validated URL/options.

- [ ] **Step 1: PostgreSQL URL 환경 테스트부터 작성**

`validEnv`의 `DATABASE_PATH`를 아래 값으로 바꾸고, SQLite 경로와 비-PostgreSQL URL 거부 테스트를 추가한다.

```ts
DATABASE_URL: 'postgresql://overtime_app:test@127.0.0.1:55432/overtime_test',

it.each(['./data/overtime.sqlite', 'mysql://user:pass@localhost/db']) (
  'rejects a non-PostgreSQL DATABASE_URL: %s',
  (DATABASE_URL) => {
    expect(() => parseEnv({ ...validEnv, DATABASE_URL })).toThrow();
  },
);
```

`migration-env.schema.spec.ts`에는 누락된 URL과 SQLite 소스 경로를 각각 거부하고 올바른 URL/경로는 보존하는 테스트를 작성한다.

```ts
expect(parseMigrationEnv({
  DATABASE_MIGRATION_URL: 'postgresql://overtime_migrator:test@postgres:5432/overtime',
  SQLITE_SOURCE_PATH: '/migration-source/overtime-cutover.sqlite',
})).toEqual({
  DATABASE_MIGRATION_URL: expect.stringContaining('postgresql://'),
  SQLITE_SOURCE_PATH: '/migration-source/overtime-cutover.sqlite',
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -w apps/api -- --runInBand config/env.schema.spec.ts config/migration-env.schema.spec.ts`

Expected: FAIL because `DATABASE_URL` and `parseMigrationEnv` do not exist.

- [ ] **Step 3: `pg` 의존성과 DB 스크립트 추가**

```bash
npm install pg -w apps/api
npm install -D @types/pg -w apps/api
```

`apps/api/package.json` scripts에 다음 계약을 추가한다.

```json
"db:migrate": "node dist/database/run-migrations.js",
"db:migrate:sqlite": "node dist/database/sqlite-migration/cli.js",
"db:verify:sqlite": "node dist/database/sqlite-migration/post-verify-cli.js"
```

- [ ] **Step 4: 런타임·migration 환경 스키마 구현**

`Env`의 `DATABASE_PATH`를 `DATABASE_URL: string`으로 교체하고 다음 Zod 필드를 사용한다.

```ts
const postgresUrl = z.string().url().refine(
  (value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol),
  'PostgreSQL URL이어야 합니다.',
);
```

`migration-env.schema.ts`는 API 전체 환경을 요구하지 않고 `DATABASE_MIGRATION_URL`과 `SQLITE_SOURCE_PATH`만 파싱한다.

- [ ] **Step 5: PostgreSQL TypeORM 옵션 구현**

`mkdirSync`와 SQLite 경로 코드를 제거하고 다음 핵심 옵션을 반환한다.

```ts
return {
  type: 'postgres',
  url: databaseUrl,
  entities: [UserEntity, SessionEntity, OvertimeRecordEntity],
  migrations: [InitialSchema1752360000000],
  synchronize: false,
  migrationsRun: false,
  extra: { max: 10 },
};
```

`database.module.ts`는 `DATABASE_URL`을 읽는다.

- [ ] **Step 6: 옵션 불변식 단위 테스트 추가**

`apps/api/src/database/typeorm.config.spec.ts`를 만들어 `type`, `url`, `synchronize`, `migrationsRun`, connection pool max를 검증한다. 실제 비밀번호를 assertion 메시지에 출력하지 않는다.

Run: `npm test -w apps/api -- --runInBand config database/typeorm.config.spec.ts`

Expected: PASS.

- [ ] **Step 7: 커밋**

```bash
git add package.json package-lock.json apps/api/package.json .env.example apps/api/src/config apps/api/src/database/typeorm.config.ts apps/api/src/database/typeorm.config.spec.ts apps/api/src/database/database.module.ts
git commit -m "feat: configure API for PostgreSQL"
```

---

### Task 2: PostgreSQL 엔티티와 명시적 스키마 migration

**Files:**
- Modify: `apps/api/src/database/entities/user.entity.ts`
- Modify: `apps/api/src/database/entities/session.entity.ts`
- Modify: `apps/api/src/database/entities/overtime-record.entity.ts`
- Replace: `apps/api/src/database/migrations/0001-initial-schema.ts`
- Create: `apps/api/src/database/migration-data-source.ts`
- Create: `apps/api/src/database/run-migrations.ts`
- Create: `apps/api/src/database/run-migrations.spec.ts`

**Interfaces:**
- DB names: `google_subject`, `profile_image_url`, `created_at`, `last_login_at`, `token_hash`, `user_id`, `expires_at`, `work_date`, `start_at`, `end_at`, `duration_minutes`, `updated_at`
- `runMigrations(databaseUrl: string): Promise<string[]>` returns applied migration names.
- `duration_minutes > 0`, UUID primary keys, UTC `timestamptz`, `work_date date`.

- [ ] **Step 1: migration runner 실패 테스트 작성**

DataSource factory를 주입할 수 있게 설계하고, runner가 `initialize → runMigrations → destroy` 순서를 지키며 실패해도 `destroy`를 호출하는 테스트를 작성한다.

```ts
await expect(runMigrations(url, () => fakeDataSource)).resolves.toEqual([
  'InitialSchema1752360000000',
]);
expect(fakeDataSource.destroy).toHaveBeenCalled();
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -w apps/api -- --runInBand database/run-migrations.spec.ts`

Expected: FAIL because the runner does not exist.

- [ ] **Step 3: 엔티티의 PostgreSQL 타입과 이름 명시**

예를 들어 `OvertimeRecordEntity`를 다음 규칙으로 바꾼다.

```ts
@PrimaryColumn('uuid') id!: string;
@Column('uuid', { name: 'user_id' }) userId!: string;
@JoinColumn({ name: 'user_id' }) user!: UserEntity;
@Column('date', { name: 'work_date' }) workDate!: string;
@Column('timestamptz', { name: 'start_at' }) startAt!: Date;
@Column('timestamptz', { name: 'end_at' }) endAt!: Date;
@Column('integer', { name: 'duration_minutes' }) durationMinutes!: number;
@CreateDateColumn({ type: 'timestamptz', name: 'created_at' }) createdAt!: Date;
@UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' }) updatedAt!: Date;
```

나머지 두 엔티티에도 같은 naming/type 규칙을 적용한다.

- [ ] **Step 4: PostgreSQL 초기 migration 작성**

`0001-initial-schema.ts`의 SQLite SQL을 PostgreSQL SQL로 교체한다. 최소 계약은 다음과 같다.

```sql
CREATE TABLE users (
  id uuid PRIMARY KEY,
  google_subject text NOT NULL,
  email text NOT NULL,
  name text NOT NULL,
  profile_image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL
);

CREATE TABLE overtime_records (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  work_date date NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_overtime_duration_positive CHECK (duration_minutes > 0),
  CONSTRAINT chk_overtime_time_order CHECK (end_at > start_at)
);
```

세션 테이블, unique/index, FK delete action도 설계 문서와 동일하게 생성한다. `down`은 자식 테이블부터 삭제한다.

- [ ] **Step 5: 명시적 migration runner 구현**

`migration-data-source.ts`는 `parseMigrationEnv(process.env)`의 URL로 `DataSource`를 만들고, `run-migrations.ts`의 CLI entry는 성공한 migration 이름만 출력한다. URL은 절대 출력하지 않는다.

- [ ] **Step 6: 단위 테스트 및 빌드**

Run: `npm test -w apps/api -- --runInBand database/run-migrations.spec.ts`

Expected: PASS.

Run: `npm run build -w apps/api`

Expected: PASS with no TypeScript errors.

- [ ] **Step 7: 커밋**

```bash
git add apps/api/src/database/entities apps/api/src/database/migrations apps/api/src/database/migration-data-source.ts apps/api/src/database/run-migrations.ts apps/api/src/database/run-migrations.spec.ts
git commit -m "feat: add PostgreSQL application schema"
```

---

### Task 3: 실제 PostgreSQL 기반 로컬 개발과 E2E 테스트

**Files:**
- Create: `compose.test.yaml`
- Create: `apps/api/test/postgres-global-setup.ts`
- Create: `apps/api/test/postgres-global-teardown.ts`
- Create: `apps/api/test/reset-postgres.ts`
- Modify: `apps/api/test/setup-env.ts`
- Modify: `apps/api/test/jest-e2e.json`
- Modify: `apps/api/test/database-schema.e2e-spec.ts`
- Modify: `apps/api/package.json`
- Modify: `package.json`

**Interfaces:**
- Test URL: `postgresql://overtime_test:overtime_test@127.0.0.1:55432/overtime_test`
- `npm run test:e2e:postgres` owns test Compose lifecycle and always removes only the test volume.
- E2E tests run serially and truncate `sessions`, `overtime_records`, `users` before each test.

- [ ] **Step 1: PostgreSQL catalog schema test로 교체**

`database-schema.e2e-spec.ts`에서 `sqlite_master`를 제거하고 아래 catalog를 조회한다.

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

SELECT indexname FROM pg_indexes WHERE schemaname = 'public';
```

컬럼 타입은 `information_schema.columns`, check/FK는 `pg_constraint`로 검증한다.

- [ ] **Step 2: 테스트 Compose 작성**

`compose.test.yaml`은 `postgres:17.10-bookworm` 한 서비스만 포함한다.

```yaml
services:
  postgres-test:
    image: postgres:17.10-bookworm
    environment:
      POSTGRES_USER: overtime_test
      POSTGRES_PASSWORD: overtime_test
      POSTGRES_DB: overtime_test
    ports:
      - "127.0.0.1:55432:5432"
    tmpfs:
      - /var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U overtime_test -d overtime_test"]
      interval: 2s
      timeout: 2s
      retries: 20
```

- [ ] **Step 3: Jest DB lifecycle 구현**

Global setup은 migration DataSource로 schema를 초기화하고 migration을 실행한다. `reset-postgres.ts`는 각 E2E test 전 아래 SQL만 실행한다.

```sql
TRUNCATE TABLE sessions, overtime_records, users CASCADE;
```

Global teardown은 connection을 닫되 Docker lifecycle은 root npm script가 담당한다.

- [ ] **Step 4: 실패 확인**

Run: `docker compose -f compose.test.yaml up -d --wait`

Run: `npm run test:e2e -w apps/api -- --runInBand`

Expected: initial FAIL until Jest setup and `DATABASE_URL` are wired.

- [ ] **Step 5: E2E 환경 연결 및 root script 추가**

`setup-env.ts`는 test URL을 설정한다. `jest-e2e.json`은 global setup/teardown과 `setupFilesAfterEnv`를 등록한다. root `package.json`에 다음 스크립트를 추가하되 종료 시 `down -v`가 test Compose에만 적용되도록 별도 shell script `deploy/test-postgres-e2e.sh`로 trap을 구현한다.

```json
"test:e2e:postgres": "bash deploy/test-postgres-e2e.sh"
```

- [ ] **Step 6: 전체 API E2E 실행**

Run: `npm run test:e2e:postgres`

Expected: all API E2E suites PASS and `docker compose -f compose.test.yaml ps` shows no remaining test container afterward.

- [ ] **Step 7: 저장소 쿼리 PostgreSQL 호환성 확인**

기존 `record.userId`, `record.workDate`, `record.startAt` property path를 사용하는 TypeORM query builder 테스트가 모두 통과하는지 확인한다. raw snake_case SQL로 임의 변경하지 않는다.

Run: `npm test`

Expected: API unit and web tests PASS.

- [ ] **Step 8: 커밋**

```bash
git add compose.test.yaml deploy/test-postgres-e2e.sh apps/api/test apps/api/package.json package.json
git commit -m "test: run API integration tests on PostgreSQL"
```

---

### Task 4: 권한 분리와 운영 PostgreSQL Compose

**Files:**
- Create: `docker/postgres/init-roles.sh`
- Create: `docker/postgres/init-roles.test.sh`
- Modify: `compose.yaml`
- Modify: `compose.production.yaml`
- Modify: `deploy/oracle/production.env.example`
- Modify: `deploy/oracle/compose-config.test.sh`
- Modify: `docker/api.Dockerfile`

**Interfaces:**
- Roles: `overtime_migrator` (schema owner), `overtime_app` (DML), `overtime_backup` (read-only)
- Host bind: `${POSTGRES_DATA_DIR:-/data/postgres}:/var/lib/postgresql/data`
- PostgreSQL service has no `ports` in production.
- API waits for `service_healthy` and receives only `DATABASE_URL`.

- [ ] **Step 1: Compose 계약 테스트 확장**

`compose-config.test.sh`에 다음 검증을 먼저 추가한다.

```bash
grep -F 'source: /data/postgres' "$tmp"
grep -F 'target: /var/lib/postgresql/data' "$tmp"
grep -F 'condition: service_healthy' "$tmp"
grep -F 'memory: "402653184"' "$tmp" # 384 MiB rendered bytes
if grep -F 'published: "5432"' "$tmp"; then
  echo 'PostgreSQL port 5432 must not be published' >&2
  exit 1
fi
```

- [ ] **Step 2: 실패 확인**

Run: `bash deploy/oracle/compose-config.test.sh`

Expected: FAIL because the postgres service does not exist.

- [ ] **Step 3: 역할 bootstrap script와 테스트 작성**

`init-roles.sh`는 공식 이미지 최초 초기화 시 다음 원칙으로 실행한다.

```sql
CREATE ROLE overtime_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE overtime_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE overtime_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER DATABASE overtime OWNER TO overtime_migrator;
ALTER SCHEMA public OWNER TO overtime_migrator;
GRANT CONNECT ON DATABASE overtime TO overtime_app, overtime_backup;
GRANT USAGE ON SCHEMA public TO overtime_app, overtime_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE overtime_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO overtime_app;
ALTER DEFAULT PRIVILEGES FOR ROLE overtime_migrator IN SCHEMA public
  GRANT SELECT ON TABLES TO overtime_backup;
```

비밀번호는 `psql --set` 또는 안전하게 quoted된 stdin으로 전달하고 stdout에 출력하지 않는다. Shell test는 가짜 `psql`로 세 역할과 privilege SQL 존재 여부, 비밀번호 미출력을 검증한다.

- [ ] **Step 4: 운영 PostgreSQL 서비스 추가**

핵심 Compose 설정은 다음과 같다.

```yaml
postgres:
  image: postgres:17.10-bookworm
  environment:
    POSTGRES_DB: overtime
    POSTGRES_USER: postgres
    POSTGRES_PASSWORD: ${POSTGRES_ADMIN_PASSWORD}
    POSTGRES_RUNTIME_PASSWORD: ${POSTGRES_RUNTIME_PASSWORD}
    POSTGRES_MIGRATION_PASSWORD: ${POSTGRES_MIGRATION_PASSWORD}
    POSTGRES_BACKUP_PASSWORD: ${POSTGRES_BACKUP_PASSWORD}
  command:
    - postgres
    - -c
    - max_connections=20
    - -c
    - shared_buffers=64MB
    - -c
    - work_mem=1MB
    - -c
    - maintenance_work_mem=32MB
  volumes:
    - ${POSTGRES_DATA_DIR:-/data/postgres}:/var/lib/postgresql/data
    - ./docker/postgres/init-roles.sh:/docker-entrypoint-initdb.d/10-init-roles.sh:ro
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U postgres -d overtime"]
  mem_limit: 384m
  restart: unless-stopped
```

API의 SQLite volume과 `DATABASE_PATH`를 제거하고 `DATABASE_URL`을 env file에서 받는다. API `depends_on.postgres.condition`을 `service_healthy`로 둔다.

- [ ] **Step 5: 운영 예시 환경 갱신**

실제 비밀번호 없이 아래 key를 추가한다.

```dotenv
POSTGRES_DATA_DIR=/data/postgres
POSTGRES_ADMIN_PASSWORD=
POSTGRES_RUNTIME_PASSWORD=
POSTGRES_MIGRATION_PASSWORD=
POSTGRES_BACKUP_PASSWORD=
DATABASE_URL=
DATABASE_MIGRATION_URL=
```

문서에서 URL의 비밀번호는 `openssl rand -hex 32`처럼 URL-safe 값으로 생성하도록 안내한다.

- [ ] **Step 6: Compose와 역할 검증**

Run: `bash docker/postgres/init-roles.test.sh`

Expected: PASS and no password value in captured stdout.

Run: `bash deploy/oracle/compose-config.test.sh`

Expected: PASS with no published 3000 or 5432 port.

Run: `docker compose --env-file deploy/oracle/production.env.example -f compose.production.yaml config --quiet`

Expected: exit 0. Empty secret handling이 config 단계에서 실패한다면 예시에는 `replace-me`만 사용하고 실제 값으로 오인될 수 있는 문자열은 쓰지 않는다.

- [ ] **Step 7: 커밋**

```bash
git add docker/postgres compose.yaml compose.production.yaml deploy/oracle/production.env.example deploy/oracle/compose-config.test.sh docker/api.Dockerfile
git commit -m "feat: run private PostgreSQL in Docker Compose"
```

---

### Task 5: SQLite→PostgreSQL 일회성 이관 도구

**Files:**
- Create: `apps/api/src/database/sqlite-migration/types.ts`
- Create: `apps/api/src/database/sqlite-migration/normalize.ts`
- Create: `apps/api/src/database/sqlite-migration/verify.ts`
- Create: `apps/api/src/database/sqlite-migration/migrate.ts`
- Create: `apps/api/src/database/sqlite-migration/cli.ts`
- Create: `apps/api/src/database/sqlite-migration/migrate.spec.ts`
- Create: `apps/api/src/database/sqlite-migration/normalize.spec.ts`

**Interfaces:**
- `migrateSqliteToPostgres(input: { sqlitePath: string; target: DataSource; allowNonEmptyTarget?: false }): Promise<MigrationReport>`
- `MigrationReport`: source/target counts, sorted ID hashes, business-field hashes, duration aggregate hash; no personal values.
- Source opens with `{ readonly: true, fileMustExist: true }`.
- One PostgreSQL transaction; sessions are never selected or inserted.

- [ ] **Step 1: representative SQLite fixture tests 작성**

Temporary SQLite에 Unicode reason, nullable image, multiple users/dates를 넣고 이관 결과를 검증한다.

```ts
expect(report.source).toEqual({ users: 2, overtimeRecords: 3 });
expect(report.target).toEqual(report.source);
expect(await target.getRepository(SessionEntity).count()).toBe(0);
```

추가 red tests:

- invalid UUID row는 해당 row ID만 포함한 오류로 중단한다.
- invalid timestamp는 개인 필드 없이 중단한다.
- target에 user/record가 하나라도 있으면 거부한다.
- duplicate run은 overwrite/upsert하지 않고 거부한다.
- FK, ID set, normalized hash, 사용자·날짜별 duration 합계 mismatch는 transaction rollback한다.
- source session이 있어도 target sessions는 0이다.

- [ ] **Step 2: 실패 확인**

Run: `npm test -w apps/api -- --runInBand database/sqlite-migration`

Expected: FAIL because migration modules do not exist.

- [ ] **Step 3: source row 타입과 정규화 구현**

SQLite camelCase column을 읽는 명시적 query를 사용한다.

```sql
SELECT id, googleSubject, email, name, profileImageUrl, createdAt, lastLoginAt
FROM users ORDER BY id;

SELECT id, userId, workDate, startAt, endAt, durationMinutes, reason, createdAt, updatedAt
FROM overtime_records ORDER BY id;
```

UUID는 `validate` 함수로 확인하고 timestamp는 `new Date(value)` 후 `Number.isNaN(date.getTime())`를 거부한다. `workDate`는 `YYYY-MM-DD`만 허용한다.

- [ ] **Step 4: deterministic verification 구현**

각 row를 key 순서가 고정된 JSON array로 정규화하고 SHA-256을 계산한다. 보고서에는 hash와 count만 남긴다.

```ts
hashRows(rows.map((row) => [
  row.id,
  row.userId,
  row.workDate,
  row.startAt.toISOString(),
  row.endAt.toISOString(),
  row.durationMinutes,
  row.reason,
  row.createdAt.toISOString(),
  row.updatedAt.toISOString(),
]));
```

- [ ] **Step 5: 단일 transaction 이관 구현**

target count가 0인지 먼저 확인하고, `target.transaction('SERIALIZABLE', ...)` 안에서 users 후 records를 `insert`한다. 검증 query도 같은 manager를 사용하며 모든 비교가 통과한 경우에만 return한다. `sessions` repository는 사용하지 않는다.

- [ ] **Step 6: CLI 구현**

CLI는 `parseMigrationEnv`, migration DataSource, `migrateSqliteToPostgres`를 조합하고 다음 안전한 요약만 JSON으로 출력한다.

```json
{"users":3,"overtimeRecords":6,"sessionsMigrated":0,"verification":"passed"}
```

URL, 이메일, 이름, reason, token은 출력하지 않는다. 실패 시 row ID와 실패 종류만 stderr에 남기고 nonzero exit한다.

- [ ] **Step 7: 모든 이관 테스트 실행**

Run: `npm test -w apps/api -- --runInBand database/sqlite-migration`

Expected: PASS, including rollback and session-exclusion cases.

Run: `npm run build -w apps/api`

Expected: PASS and `dist/database/sqlite-migration/cli.js` exists.

- [ ] **Step 8: 커밋**

```bash
git add apps/api/src/database/sqlite-migration
git commit -m "feat: migrate verified SQLite data to PostgreSQL"
```

---

### Task 6: PostgreSQL custom-format 백업과 OCI 업로드

**Files:**
- Create: `docker/postgres-backup.sh`
- Create: `docker/postgres-backup-oci.sh`
- Replace: `docker/backup-restore.test.sh`
- Modify: `deploy/oracle/overtime-backup.service`
- Modify: `deploy/oracle/overtime-backup.timer`
- Modify: `deploy/oracle/systemd-units.test.sh`

**Interfaces:**
- Local artifact set: `overtime-<UTC>.dump`, `.dump.sha256`, `.metadata`
- Uses `pg_dump -Fc`, `pg_restore --list`, `sha256sum -c`.
- OCI object prefix: `postgres/overtime-<UTC>.*`
- Local retention: two days; cleanup only after a new validated upload succeeds.

- [ ] **Step 1: backup shell contract tests 작성**

가짜 `docker`와 `oci` binaries로 다음을 검증한다.

- `pg_dump --format=custom --no-owner --no-acl`
- `pg_restore --list` 성공 전에는 OCI가 호출되지 않음
- checksum과 metadata 생성
- 세 artifact 모두 `--auth instance_principal`로 업로드
- upload 실패 시 기존 backup 삭제 없음
- 성공 후에만 `-mtime +2` cleanup 실행
- password가 stdout/stderr에 나타나지 않음

- [ ] **Step 2: 실패 확인**

Run: `bash docker/backup-restore.test.sh`

Expected: FAIL because PostgreSQL backup scripts do not exist.

- [ ] **Step 3: 로컬 backup script 구현**

`postgres-backup.sh`는 `/opt/overtime`에서 다음 형태로 DB 컨테이너의 client를 사용한다.

```bash
docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" \
  exec -T -e PGPASSWORD="$POSTGRES_BACKUP_PASSWORD" postgres \
  pg_dump --username overtime_backup --dbname overtime \
  --format=custom --no-owner --no-acl > "$temporary_dump"

docker compose ... exec -T postgres pg_restore --list < "$temporary_dump" >/dev/null
```

실제 구현은 partially written artifact가 최종 이름으로 보이지 않도록 같은 filesystem의 temporary path에 쓴 뒤 `mv`한다. metadata에는 UTC timestamp, `SELECT version()`의 major/minor, archive basename만 기록한다.

- [ ] **Step 4: OCI adapter 구현**

검증된 artifact set을 `oci os object put --auth instance_principal`로 업로드한다. 모든 upload가 성공한 후에만 로컬 2일 retention을 적용한다.

- [ ] **Step 5: systemd를 6시간 간격으로 갱신**

Service는 root로 Docker를 호출하되 환경 파일 권한을 0600으로 유지한다.

```ini
[Service]
Type=oneshot
EnvironmentFile=/opt/overtime/.env.backup
ExecStart=/opt/overtime/docker/postgres-backup-oci.sh
```

Timer:

```ini
OnCalendar=*-*-* 00,06,12,18:00:00 Asia/Seoul
Persistent=true
RandomizedDelaySec=5m
```

- [ ] **Step 6: 검증**

Run: `bash -n docker/postgres-backup.sh docker/postgres-backup-oci.sh docker/backup-restore.test.sh`

Run: `bash docker/backup-restore.test.sh`

Run: `bash deploy/oracle/systemd-units.test.sh`

Expected: all PASS.

- [ ] **Step 7: 커밋**

```bash
git add docker/postgres-backup.sh docker/postgres-backup-oci.sh docker/backup-restore.test.sh deploy/oracle/overtime-backup.service deploy/oracle/overtime-backup.timer deploy/oracle/systemd-units.test.sh
git commit -m "feat: back up PostgreSQL to OCI every six hours"
```

---

### Task 7: 주간 임시 DB 복구 훈련

**Files:**
- Create: `docker/postgres-restore-drill.sh`
- Create: `docker/postgres-restore-drill.test.sh`
- Create: `deploy/oracle/overtime-restore-drill.service`
- Create: `deploy/oracle/overtime-restore-drill.timer`
- Modify: `deploy/oracle/systemd-units.test.sh`

**Interfaces:**
- Temporary DB pattern: `overtime_restore_drill_<UTC digits>`.
- Input is newest fully validated local archive set or explicitly named OCI object.
- Production target name `overtime` is hard-rejected.
- Cleanup trap drops only the generated temporary database.

- [ ] **Step 1: destructive-target safety tests 작성**

가짜 Docker CLI로 다음 red tests를 만든다.

- `RESTORE_DATABASE=overtime` 거부
- 허용 pattern 이외 DB 이름 거부
- archive checksum failure 시 `createdb` 미호출
- `createdb → pg_restore → checks → dropdb` 순서
- 중간 실패에서도 generated temp DB만 `dropdb --if-exists`
- source archive나 production DB를 삭제하는 명령 부재

- [ ] **Step 2: 실패 확인**

Run: `bash docker/postgres-restore-drill.test.sh`

Expected: FAIL because restore drill script does not exist.

- [ ] **Step 3: restore drill 구현**

검증 순서:

1. `sha256sum -c`
2. `pg_restore --list`
3. temporary DB create (owner `overtime_migrator`)
4. `pg_restore --exit-on-error --no-owner --no-acl`
5. migration table 존재/최신 migration 확인
6. users/records counts가 metadata 또는 archive query와 일치
7. orphan FK query가 0
8. basic report aggregation query 성공
9. cleanup trap으로 temp DB drop

- [ ] **Step 4: weekly systemd units 구현**

일요일 04:30 KST로 백업 시간과 겹치지 않게 예약한다.

```ini
OnCalendar=Sun *-*-* 04:30:00 Asia/Seoul
Persistent=true
RandomizedDelaySec=10m
```

- [ ] **Step 5: 검증**

Run: `bash docker/postgres-restore-drill.test.sh`

Run: `bash deploy/oracle/systemd-units.test.sh`

Run: `systemd-analyze verify deploy/oracle/overtime-*.service deploy/oracle/overtime-*.timer`

Expected: all PASS on a Linux environment; macOS에서는 first two tests를 필수로 실행하고 `systemd-analyze`는 Oracle VM preflight에서 실행한다.

- [ ] **Step 6: 커밋**

```bash
git add docker/postgres-restore-drill.sh docker/postgres-restore-drill.test.sh deploy/oracle/overtime-restore-drill.service deploy/oracle/overtime-restore-drill.timer deploy/oracle/systemd-units.test.sh
git commit -m "feat: verify PostgreSQL backups with weekly restores"
```

---

### Task 8: PostgreSQL 운영·복구 runbook과 안전 계약

**Files:**
- Modify: `docs/runbooks/local-development.md`
- Modify: `docs/runbooks/backup-restore.md`
- Modify: `docs/runbooks/oracle-deployment.md`
- Modify: `deploy/oracle/runbook-restore.test.sh`
- Modify: `README.md`

**Interfaces:**
- Manual restore requires `RESTORE_DATABASE` matching a non-production staging name plus `CONFIRM_RESTORE=YES`.
- Production recovery is a separate documented procedure and never overwrites the current DB without a fresh backup and explicit confirmation.
- Final SQLite snapshot retention date and checksum must be recorded.

- [ ] **Step 1: runbook safety test를 PostgreSQL로 교체**

Test must prove:

- checksum and `pg_restore --list` happen before API stop for real recovery;
- recovery creates a fresh database name first;
- API restart exists in EXIT trap;
- no `dropdb overtime` or `DROP DATABASE overtime` literal exists;
- restore drill commands reject production DB name.

- [ ] **Step 2: 실패 확인**

Run: `bash deploy/oracle/runbook-restore.test.sh`

Expected: FAIL against the old SQLite runbook.

- [ ] **Step 3: local development runbook 갱신**

Document:

```bash
cp .env.example .env
docker compose up -d postgres
npm run db:migrate -w apps/api
npm run dev
npm run test:e2e:postgres
```

`docker compose down`은 `/data` 또는 named volume을 삭제하지 않지만 `down -v`는 로컬 test 외에 사용하지 않는다고 명시한다.

- [ ] **Step 4: backup/restore runbook 갱신**

6시간 timer, artifact 세트, OCI 30일 lifecycle, 로컬 2일 retention, weekly drill, 수동 recovery 절차를 명시한다. 실 비밀번호/URL은 쓰지 않는다.

- [ ] **Step 5: Oracle runbook 갱신**

다음을 정확히 포함한다.

- `/data/postgres` 생성 및 UID/GID는 image 안의 `postgres` UID를 container로 확인한 후 설정
- `.env.production`, `.env.backup` mode 0600
- 4개 password 생성과 URL-safe connection URL 구성
- 5432 비노출 확인
- explicit migration command
- cutover/rollback boundary
- SQLite read-only 30일 보존
- backup upload와 temporary restore 성공 증거

- [ ] **Step 6: 문서 계약 검증**

Run: `bash deploy/oracle/runbook-restore.test.sh`

Expected: PASS.

Run: `rg -n 'DATABASE_PATH|SQLite backup|sqlite_master|daily backup' README.md docs/runbooks deploy/oracle`

Expected: only historical migration/rollback context remains; no active runtime instruction points API at SQLite.

- [ ] **Step 7: 커밋**

```bash
git add docs/runbooks README.md deploy/oracle/runbook-restore.test.sh
git commit -m "docs: add PostgreSQL operations and recovery runbooks"
```

---

### Task 9: 전체 자동 검증과 로컬 이관 리허설

**Files:**
- Modify as needed only in files from Tasks 1–8 when verification exposes defects.
- Create: `deploy/oracle/postgres-migration-rehearsal.sh`
- Create: `deploy/oracle/postgres-migration-rehearsal.test.sh`

**Interfaces:**
- Rehearsal source is a local copied fixture or sanitized SQLite copy, never `/data/overtime/overtime.sqlite` over SSH.
- Rehearsal target is test PostgreSQL only.
- Output contains counts/hashes, not personal data.

- [ ] **Step 1: rehearsal orchestration test 작성**

가짜 commands로 순서를 검증한다.

1. SQLite `.backup`
2. `PRAGMA integrity_check`
3. checksum/count capture
4. PostgreSQL migration
5. data transfer
6. verification
7. API E2E/smoke
8. test-only cleanup

- [ ] **Step 2: rehearsal script 구현**

Script는 source가 workspace temp path인지 확인하고 `/data/overtime/overtime.sqlite`를 명시적으로 거부한다. target URL host가 `127.0.0.1` 또는 Compose test service가 아니면 거부한다.

- [ ] **Step 3: 정적·단위·통합 검증 일괄 실행**

```bash
npm ci
npm run lint
npm test
npm run build
npm run test:e2e:postgres
bash docker/postgres/init-roles.test.sh
bash docker/backup-restore.test.sh
bash docker/postgres-restore-drill.test.sh
bash deploy/oracle/compose-config.test.sh
bash deploy/oracle/systemd-units.test.sh
bash deploy/oracle/runbook-restore.test.sh
bash deploy/oracle/postgres-migration-rehearsal.test.sh
```

Expected: every command exits 0.

- [ ] **Step 4: representative fixture로 end-to-end rehearsal**

Run: `bash deploy/oracle/postgres-migration-rehearsal.sh fixtures/or equivalent temp SQLite path`

Expected:

- users/records exact counts and hashes match;
- target sessions count is 0;
- second run refuses non-empty target;
- backup archive validates and restores to a temporary DB;
- no production host/IP/path appears in command output.

- [ ] **Step 5: 최종 self-review**

```bash
rg -n 'TODO|FIXME|placeholder|your-password|change-me' apps/api docker deploy compose*.yaml docs/runbooks
rg -n 'migrationsRun:\s*true|synchronize:\s*true|5432:5432|0\.0\.0\.0:5432' . -g '!node_modules' -g '!apps/coupang-ledger/**'
git diff --check
git status --short
```

Expected:

- no implementation placeholder;
- no automatic migration/synchronize;
- no production 5432 exposure;
- only intended files plus pre-existing `apps/coupang-ledger/` are shown.

- [ ] **Step 6: 커밋**

```bash
git add deploy/oracle/postgres-migration-rehearsal.sh deploy/oracle/postgres-migration-rehearsal.test.sh
git commit -m "test: rehearse SQLite to PostgreSQL cutover"
```

---

### Task 10: Oracle VM 사전 준비와 비파괴 배포

**Files:**
- No repository source changes expected.
- Server-only: `/opt/overtime/.env.production`, `/opt/overtime/.env.backup`, `/data/postgres`, `/data/overtime/postgres-backups`, systemd units.

**Interfaces:**
- SSH target: existing Oracle VM; use the already configured key and user without writing them into repository files.
- This task may start an empty PostgreSQL but must not stop the live SQLite API or modify live SQLite.

- [ ] **Step 1: 사용자에게 VM preflight 실행 승인 요청**

승인 전에는 SSH write, package install, container start, systemd install을 하지 않는다.

- [ ] **Step 2: 현재 서비스와 데이터 read-only preflight**

Record, without secrets:

```bash
docker compose --env-file .env.production -f compose.production.yaml ps
findmnt /data/overtime
df -h /data/overtime
free -h
docker stats --no-stream
sqlite3 /data/overtime/overtime.sqlite 'PRAGMA integrity_check;'
```

Fresh source counts를 별도 운영 기록에 남기되 이메일/name/reason/token은 출력하지 않는다.

- [ ] **Step 3: 코드 pull/build 전에 rollback image tag 보존**

현재 정상 SQLite API image ID를 확인하고 immutable local tag `overtime-api:sqlite-rollback-<gitsha>`를 만든다. 현재 Compose 파일과 `.env.production`은 비밀값 권한을 유지한 채 `/opt/overtime/rollback/<UTC>/`에 root-readable copy로 보존한다. Git이나 채팅으로 복사하지 않는다.

- [ ] **Step 4: PostgreSQL 디렉터리와 secrets 준비**

`/data/postgres`를 만들고 official image의 numeric postgres UID/GID를 확인해 소유권을 맞춘다. 네 개 비밀번호를 `openssl rand -hex 32`로 생성하고 `.env.production`/`.env.backup` mode 0600 파일에만 넣는다. 명령 history에 값이 직접 남지 않게 편집한다.

- [ ] **Step 5: 새 코드와 image build**

```bash
git fetch --all --prune
git pull --ff-only
docker compose --env-file .env.production -f compose.production.yaml build api web
docker compose --env-file .env.production -f compose.production.yaml config --quiet
```

아직 live API를 recreate하지 않는다.

- [ ] **Step 6: 빈 PostgreSQL만 시작하고 권한 확인**

```bash
docker compose --env-file .env.production -f compose.production.yaml up -d postgres
docker compose --env-file .env.production -f compose.production.yaml ps postgres
```

Migration role로 schema create 가능, runtime role로 create 불가, backup role로 write 불가를 test DB 또는 transaction rollback 안에서 검증한다. 운영 business table은 아직 생성하지 않는다.

- [ ] **Step 7: resource/visibility 확인**

```bash
docker stats --no-stream
ss -lnt
docker compose --env-file .env.production -f compose.production.yaml exec -T postgres pg_isready -U postgres -d overtime
```

Expected: PostgreSQL healthy, host `:5432` listener 없음, swap thrashing 없음, 최소 200 MiB 이상의 즉시 가용 메모리 또는 합의된 안전 여유.

- [ ] **Step 8: systemd units 설치하되 timer는 아직 활성화하지 않음**

`systemd-analyze verify`까지만 수행한다. 빈 DB 백업을 healthy backup으로 오인하지 않도록 cutover 전 timer는 enable하지 않는다.

- [ ] **Step 9: preflight 결과 보고 및 유지보수 승인 대기**

보고 항목: current counts, SQLite integrity/checksum 준비 가능 여부, PostgreSQL health/version, role checks, no-5432 evidence, memory/disk, rollback tag, automated test SHA. 실제 Task 11은 별도 명시적 승인 없이는 시작하지 않는다.

---

### Task 11: 운영 cutover, 검증, 백업 활성화

**Files:**
- No repository changes expected unless a verified defect is found; defects require returning to Tasks 1–10 rather than hot-editing production.
- Server artifacts: final SQLite snapshot/checksum, PostgreSQL data, backup artifacts, journal evidence.

**Interfaces:**
- Maintenance budget: up to 10 minutes.
- Rollback allowed only before service reopening and only if PostgreSQL has accepted no user writes.
- Success requires data verification, login/read/report/CSV checks, first OCI backup, and temporary restore drill.

- [ ] **Step 1: 사용자에게 유지보수 시작 최종 승인 요청**

승인 메시지에 API 중지, 예상 10분, 전 직원 재로그인, rollback boundary를 다시 명시한다.

- [ ] **Step 2: maintenance 시작 및 API 중지**

```bash
docker compose --env-file .env.production -f compose.production.yaml stop api
```

API가 실제 stopped인지 확인하고 maintenance 시작 UTC/KST를 기록한다.

- [ ] **Step 3: final SQLite snapshot 생성·검증**

`sqlite3 .backup`으로 timestamped snapshot을 `/data/overtime/sqlite-archive`에 만들고:

- `PRAGMA integrity_check = ok`
- users, overtime_records, sessions fresh counts
- SHA-256
- file mode 0400 또는 read-only ACL

을 기록한다. 원본 `/data/overtime/overtime.sqlite`는 그대로 둔다.

- [ ] **Step 4: 빈 target과 migration 실행**

Migration 계정으로 explicit schema migration을 실행한다.

```bash
docker compose --env-file .env.production -f compose.production.yaml run --rm --no-deps api npm run db:migrate
```

Target business count가 0인지 확인한 뒤 final snapshot을 read-only mount하여 이관 CLI를 실행한다.

```bash
docker compose --env-file .env.production -f compose.production.yaml run --rm --no-deps \
  -v /data/overtime/sqlite-archive:/migration-source:ro \
  -e SQLITE_SOURCE_PATH=/migration-source/<FINAL_SNAPSHOT> \
  api npm run db:migrate:sqlite
```

- [ ] **Step 5: commit 후 독립 재검증**

CLI report만 신뢰하지 않고 final snapshot과 commit된 PostgreSQL을 읽는 독립 verifier를 실행한다.

```bash
docker compose --env-file .env.production -f compose.production.yaml run --rm --no-deps \
  -v /data/overtime/sqlite-archive:/migration-source:ro \
  -e SQLITE_SOURCE_PATH=/migration-source/<FINAL_SNAPSHOT> \
  -e DATABASE_MIGRATION_URL \
  api npm run db:verify:sqlite
```

명령이 0으로 종료하고 `"verification":"passed"`를 출력할 때만 다음을 통과한 것으로 판단한다.

- source/target users exact ID set/count
- source/target records exact ID set/count
- target sessions = 0
- orphan records = 0
- deterministic business hash match
- duration total per user/work date match
- migration table at expected version

어느 하나라도 실패하면 서비스는 열지 않는다.

- [ ] **Step 6: PostgreSQL API 시작과 read-only smoke checks**

```bash
docker compose --env-file .env.production -f compose.production.yaml up -d api
docker compose --env-file .env.production -f compose.production.yaml ps
curl --fail https://aims-overtime.duckdns.org/api/health
```

허용된 계정 로그인, 기존 개인 기록 조회, `contact@aimskr.com` 관리자 이동/목록/집계/CSV를 확인한다. 새 기록을 만들거나 기존 기록을 수정·삭제하지 않는다.

- [ ] **Step 7: reopen 또는 SQLite rollback 결정**

모든 검증이 통과하면 maintenance 종료를 선언하고 PostgreSQL을 source of truth로 지정한다. 실패했고 아직 사용자에게 열지 않았으며 PostgreSQL user write가 0이면 새 API를 중지하고 보존한 SQLite rollback image/Compose/env로 복귀한다. 원인 해결 전 PostgreSQL data를 삭제하지 않는다.

- [ ] **Step 8: 첫 PostgreSQL backup과 restore drill**

```bash
sudo systemctl start overtime-backup.service
sudo systemctl show overtime-backup.service -p Result -p ExecMainStatus
sudo systemctl start overtime-restore-drill.service
sudo systemctl show overtime-restore-drill.service -p Result -p ExecMainStatus
```

Object Storage에 `.dump`, `.sha256`, `.metadata`가 모두 있고 private인지 확인한다. restore drill이 temporary DB를 제거하고 production count/FK/basic queries를 통과했는지 journal로 확인한다.

- [ ] **Step 9: timers 활성화**

```bash
sudo systemctl enable --now overtime-backup.timer overtime-restore-drill.timer
sudo systemctl list-timers 'overtime-*'
```

Expected: 6시간 backup과 주간 restore 일정이 표시된다.

- [ ] **Step 10: 24시간 관찰과 최종 증거 기록**

API/PostgreSQL restart count, memory/swap, disk, slow/error logs, 첫 정상 직원 write, 다음 예약 backup 성공을 관찰한다. 개인 필드는 기록하지 않는다. SQLite archive의 30일 보존 종료일을 기록하고, 그 날짜가 지나도 별도 승인 없이 삭제하지 않는다.

---

## Final Verification Checklist

- [ ] `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e:postgres`가 모두 통과한다.
- [ ] migration tests가 Unicode/null/date/invalid UUID/invalid timestamp/non-empty target/rollback/session exclusion을 모두 다룬다.
- [ ] production Compose에 5432 host port가 없고 `/data/postgres` bind와 health gate가 있다.
- [ ] runtime role은 DDL 불가, migration role은 non-superuser schema owner, backup role은 read-only다.
- [ ] API startup은 migration을 자동 실행하지 않는다.
- [ ] PostgreSQL archive validation, checksum, OCI upload, local retention, weekly restore drill tests가 통과한다.
- [ ] 운영 final snapshot integrity/checksum/count를 기록했고 원본 SQLite는 변경되지 않았다.
- [ ] source/target users·records ID/count/hash/aggregate가 일치하고 sessions는 0이다.
- [ ] HTTPS health, Google login, 개인 기록 read, 관리자 report, CSV가 실제 운영에서 통과한다.
- [ ] 첫 외부 backup과 temporary restore가 성공했다.
- [ ] 서비스 재개 이후 SQLite rollback 금지 경계가 운영 기록에 명시돼 있다.
- [ ] `apps/coupang-ledger/`는 수정·stage되지 않았다.
