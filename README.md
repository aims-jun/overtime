# 늦은 기록

모바일에서 야근 시간을 남기고 관리자가 월별 현황과 CSV를 확인하는 사내용 서비스입니다. 프론트엔드 개발자가 백엔드의 인증, 권한, 도메인 규칙, DB, 운영을 한 프로젝트에서 학습할 수 있도록 구성했습니다.

## 주요 기능

- 회사 Google Workspace 계정 로그인
- HTTP-only 서버 세션과 관리자 이메일 기반 권한
- 내 야근 기록 생성·수정·삭제, 자정 넘김과 중복 시간 검증
- 관리자 전체/직원별 월 집계와 CSV 내보내기
- 모바일 우선 React UI
- SQLite 영속 볼륨, Caddy 프록시, DB 준비 상태 헬스체크
- 일관된 SQLite 백업·복구와 GCP e2-micro 배포 절차

## 기술 구성

- 웹: React 19, TypeScript, Vite, React Query, React Router
- API: NestJS 11, TypeORM, Zod, Google Auth Library
- DB: SQLite (`better-sqlite3`)
- 운영: Docker Compose, Caddy, GCP Compute Engine / Persistent Disk

```text
모바일 브라우저 → Caddy(:80/:443) ┬→ React 정적 파일
                                  └→ Nest API(:3000) → SQLite
```

## 빠른 시작

```bash
cp .env.example .env
npm ci
npm run dev
```

`.env`의 Google 클라이언트 ID, 회사 도메인, 관리자 이메일, 세션 비밀값을 먼저 바꾸세요. 웹은 `http://localhost:5173`, API 헬스체크는 `http://localhost:3000/api/health`입니다.

```bash
npm run lint
npm test
npm run test:e2e -w apps/api -- --runInBand
npm run build
```

## 학습 순서

1. `apps/api/src/overtime/domain`에서 프레임워크와 분리된 시간 규칙을 봅니다.
2. `auth`의 Google 토큰 검증 → 사용자 저장 → 세션 쿠키 흐름을 따라갑니다.
3. `overtime`의 Controller → Service → Repository → Entity 흐름을 봅니다.
4. `reports`에서 관리자 Guard와 집계·CSV 보안을 확인합니다.
5. E2E 테스트가 HTTP, 권한, SQLite를 함께 검증하는 방식을 봅니다.
6. Compose 볼륨과 백업 스크립트로 “데이터가 어디에 남는지” 확인합니다.

## 문서

- [설계 문서](docs/superpowers/specs/2026-07-13-overtime-tracker-design.md)
- [로컬 개발과 Docker](docs/runbooks/local-development.md)
- [백업과 복구](docs/runbooks/backup-restore.md)
- [GCP 배포](docs/runbooks/gcp-deployment.md)

운영 비밀값인 `.env`, SQLite 파일, 백업 파일은 Git에 포함되지 않습니다.
