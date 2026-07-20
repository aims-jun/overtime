# 로컬 PostgreSQL 개발

## 1. 준비

Node.js 22, npm 10, Docker Compose plugin이 필요하다. 저장소 루트에서 실행한다.

```bash
cp .env.example .env
npm ci
```

`.env`의 `POSTGRES_ADMIN_PASSWORD`, `POSTGRES_RUNTIME_PASSWORD`, `POSTGRES_MIGRATION_PASSWORD`, `POSTGRES_BACKUP_PASSWORD`에는 로컬 전용 값을 넣고, `DATABASE_URL`과 `DATABASE_MIGRATION_URL`의 비밀번호를 각각 runtime/migration 값과 맞춘다. 이 값은 커밋하지 않는다. 호스트에서 npm 명령을 실행할 때는 두 URL의 host/port가 로컬 PostgreSQL endpoint를 가리켜야 한다.

## 2. 개발 순서

PostgreSQL을 먼저 시작하고 migration role로 schema migration을 명시적으로 실행한 다음 API와 web을 시작한다.

```bash
cp .env.example .env
docker compose up -d postgres
npm run build -w apps/api
npm run db:migrate -w apps/api
npm run dev
```

API는 `DATABASE_URL`의 `overtime_app` role을 쓴다. migration은 `DATABASE_MIGRATION_URL`의 `overtime_migrator` role로만 수행한다. API 시작 시 migration을 자동 실행하지 않는다.

```bash
curl --fail http://localhost:3000/api/health
docker compose ps
```

## 3. PostgreSQL E2E

전용 test Compose가 loopback test port를 열고 스키마를 준비·정리한다.

```bash
npm run test:e2e:postgres
```

## 4. 종료와 데이터 보존

```bash
docker compose down
```

`docker compose down`은 container와 network를 제거하지만 `/data`에 bind mount한 PostgreSQL 데이터나 named volume을 삭제하지 않는다. `docker compose down -v`는 named volume을 삭제하므로 폐기해도 되는 로컬 test 환경 외에서는 사용하지 않는다. 운영에서는 `/data/postgres`를 직접 삭제하거나 초기화하지 않는다.

## 5. 기본 검증

```bash
npm run lint
npm test
npm run build
npm run test:e2e:postgres
```
