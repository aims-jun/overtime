# 로컬 개발과 Docker 실행

## 1. 처음 한 번 준비

Node.js 22와 Docker Desktop이 필요합니다.

```bash
cp .env.example .env
npm ci
mkdir -p data
```

`.env`에서 아래 값을 실제 환경에 맞게 바꿉니다.

- `GOOGLE_CLIENT_ID`: Google Cloud에서 만든 웹 클라이언트 ID
- `GOOGLE_HOSTED_DOMAIN`: 회사 Google Workspace 도메인
- `ADMIN_EMAILS`: 관리자 이메일(여러 명이면 쉼표로 구분)
- `SESSION_HASH_SECRET`: 32자 이상의 무작위 문자열
- `APP_ORIGIN`: 로컬 Docker는 `http://localhost:8080`

Google OAuth 클라이언트의 **승인된 JavaScript 원본**에도 `http://localhost:5173`(일반 개발)과 `http://localhost:8080`(Docker)을 등록합니다. 리디렉션 URI는 사용하지 않습니다.

## 2. 일반 개발

```bash
npm run dev
```

- 웹: `http://localhost:5173`
- API 헬스체크: `http://localhost:3000/api/health`

TypeORM 마이그레이션은 API가 시작될 때 자동 실행됩니다. SQLite 파일은 기본적으로 `data/overtime.sqlite`에 생성됩니다.

## 3. 운영 형태로 로컬 실행

이미지·프록시·영속 볼륨 구조는 운영과 같지만, localhost의 HTTP를 허용하기 위해 API 환경만 `development`로 실행합니다. GCP용 `compose.production.yaml`은 `production`과 HTTPS 검증을 유지합니다.

호스트 사용자 ID로 SQLite 파일을 만들도록 다음 값을 `.env`에 추가할 수 있습니다.

```dotenv
OVERTIME_UID=1000
OVERTIME_GID=1000
OVERTIME_DATA_DIR=./data
WEB_PORT=8080
```

macOS에서는 기본값으로도 실행할 수 있습니다. Linux에서 `id -u`, `id -g` 결과가 1000이 아니면 그 값을 사용하세요.

```bash
docker compose build
docker compose up -d
curl --fail http://localhost:8080/api/health
docker compose restart api
curl --fail http://localhost:8080/api/health
docker compose down
```

`docker compose down`은 컨테이너만 내립니다. `data/overtime.sqlite`는 호스트에 그대로 남습니다.

## 4. 검증 명령

```bash
npm test
npm run test:e2e -w apps/api -- --runInBand
npm run build
npm run lint
```

## 5. 로컬 데이터 초기화

아래 작업은 **로컬 야근 기록을 모두 삭제**합니다. 컨테이너를 먼저 내리고 백업이 필요 없는지 확인한 뒤 직접 `data/overtime.sqlite` 파일을 삭제하세요. 다음 실행 시 빈 DB가 다시 만들어집니다. 운영 서버에서는 이 방법을 사용하면 안 됩니다.
