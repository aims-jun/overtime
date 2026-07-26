# 늦은 기록

모바일에서 야근 시간을 남기고 관리자가 월별 현황과 Excel(.xlsx)을 확인하는 사내용 서비스입니다.

## 주요 기능

- 회사 Google Workspace 계정 로그인과 HTTP-only 세션
- 내 야근 기록 생성·수정·삭제, 자정 넘김과 중복 시간 검증
- 관리자 전체/직원별 월 집계와 Excel(.xlsx) 내보내기
- PostgreSQL role 분리, Caddy 프록시, 백업·임시 DB 복구 훈련

## 기술 구성

- 웹: React 19, TypeScript, Vite, React Query, React Router
- API: NestJS 11, TypeORM, Zod, Google Auth Library
- DB: PostgreSQL 17 (`overtime_app`, `overtime_migrator`, `overtime_backup` role 분리)
- 운영: Docker Compose, Caddy, Oracle Cloud Always Free

```text
모바일 브라우저 → Caddy(:80/:443) ┬→ React 정적 파일
                                  └→ Nest API(:3000) → PostgreSQL(내부 network)
```

PostgreSQL은 운영 host port에 publish하지 않는다. schema migration은 API 시작과 분리해 migration role로 명시적으로 실행한다.

## 빠른 시작

```bash
cp .env.example .env
docker compose up -d postgres
npm run build -w apps/api
npm run db:migrate -w apps/api
npm run dev
npm run test:e2e:postgres
```

`.env`의 Google client ID, 회사 도메인, 관리자 이메일, 세션 비밀값과 PostgreSQL 로컬 비밀값/URL을 먼저 맞추세요. 자세한 준비는 [로컬 개발 실행서](docs/runbooks/local-development.md)를 따릅니다.

```bash
npm run lint
npm test
npm run build
npm run test:e2e:postgres
```

## 문서

- [PostgreSQL migration 설계](docs/superpowers/specs/2026-07-19-postgresql-migration-design.md)
- [로컬 PostgreSQL 개발](docs/runbooks/local-development.md)
- [PostgreSQL 백업과 복구](docs/runbooks/backup-restore.md)
- [Oracle Always Free 배포](docs/runbooks/oracle-deployment.md)

Oracle Always Free 인스턴스는 SLA가 보장되지 않고 유휴 상태로 판단되면 회수될 수 있으므로, 회사 필수 시스템이 되면 SLA가 있는 유료 인프라를 검토하세요. `.env`, database 데이터, backup artifact는 Git에 포함하지 않습니다.
