# GCP e2-micro 배포

이 문서는 먼저 **도메인 없이 인프라와 화면을 확인**하고, 나중에 도메인을 연결해 Google 로그인을 활성화하는 순서입니다.

> 비용 주의: Google Cloud 무료 등급은 현재 `us-west1`, `us-central1`, `us-east1`의 월간 `e2-micro` 사용량과 표준 Persistent Disk 30GB-월 등을 포함합니다. 외부 IPv4, Artifact Registry, Cloud Storage, 스냅샷, 초과 트래픽·디스크는 과금될 수 있습니다. 무료 등급은 0원 보장이 아니므로 결제 계정 예산 알림을 먼저 만드세요. 최신 조건은 [Google Cloud Free Program](https://cloud.google.com/free/docs/free-cloud-features)에서 다시 확인합니다.

## 1. 변수와 API

```bash
export PROJECT_ID="your-project"
export REGION="us-west1"
export ZONE="us-west1-b"
export VM="overtime"
export REPOSITORY="overtime"
export BUCKET="${PROJECT_ID}-overtime-backup"
export SERVICE_ACCOUNT="overtime-vm@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT_ID"
gcloud services enable compute.googleapis.com artifactregistry.googleapis.com storage.googleapis.com iam.googleapis.com
```

Cloud Billing의 **Budgets & alerts**에서 작은 월 예산과 50%, 90%, 100% 알림을 만듭니다. 예산 알림은 리소스를 자동 중지하지 않습니다.

## 2. 최소 권한 서비스 계정과 저장소

```bash
gcloud iam service-accounts create overtime-vm \
  --display-name="Overtime VM"

gcloud artifacts repositories create "$REPOSITORY" \
  --repository-format=docker \
  --location="$REGION"

gcloud artifacts repositories add-iam-policy-binding "$REPOSITORY" \
  --location="$REGION" \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/artifactregistry.reader"

gcloud storage buckets create "gs://$BUCKET" \
  --location="$REGION" \
  --uniform-bucket-level-access \
  --public-access-prevention

gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/storage.objectCreator"
```

버킷에는 필요에 맞는 보존 정책과 90일 삭제 수명 주기를 설정합니다. 삭제 규칙을 잠그기 전에 복구 훈련을 먼저 하세요. Cloud Storage 수명 주기 동작은 비동기입니다.

## 3. VM과 분리 데이터 디스크

무료 등급 디스크 한도를 고려해 표준 PD 기준 부팅 10GB + 데이터 20GB로 시작합니다. 다른 디스크·스냅샷도 합산될 수 있습니다.

```bash
gcloud compute disks create overtime-data \
  --zone="$ZONE" --size=20GB --type=pd-standard

gcloud compute instances create "$VM" \
  --zone="$ZONE" \
  --machine-type=e2-micro \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --boot-disk-type=pd-standard \
  --boot-disk-size=10GB \
  --service-account="$SERVICE_ACCOUNT" \
  --scopes=cloud-platform \
  --tags=overtime-web,iap-ssh \
  --deletion-protection

gcloud compute instances attach-disk "$VM" \
  --zone="$ZONE" --disk=overtime-data --device-name=overtime-data
gcloud compute instances set-disk-auto-delete "$VM" \
  --zone="$ZONE" --disk=overtime-data --no-auto-delete
```

`delete-auto=false`와 VM 삭제 방지는 서로 다른 보호 장치입니다. 그래도 프로젝트 삭제나 파일 손상은 막지 못하므로 Cloud Storage 백업이 필요합니다. [Compute Engine 삭제 보호 문서](https://cloud.google.com/compute/docs/instances/preventing-accidental-vm-deletion)를 참고하세요.

방화벽은 웹 80/443과 IAP SSH만 엽니다. API 3000은 열지 않습니다.

```bash
gcloud compute firewall-rules create overtime-web \
  --allow=tcp:80,tcp:443,udp:443 \
  --target-tags=overtime-web \
  --source-ranges=0.0.0.0/0

gcloud compute firewall-rules create overtime-iap-ssh \
  --allow=tcp:22 \
  --target-tags=iap-ssh \
  --source-ranges=35.235.240.0/20

gcloud compute project-info add-metadata --metadata enable-oslogin=TRUE
gcloud compute ssh "$VM" --zone="$ZONE" --tunnel-through-iap
```

사용자에게는 필요한 경우에만 IAP 터널·OS Login 역할을 부여합니다. 전체 인터넷에 22번 포트를 열지 않습니다.

## 4. 데이터 디스크 마운트와 Docker

VM에서 최초 한 번 실행합니다. `mkfs`는 기존 파일시스템이 없는 새 디스크에서만 실행해야 합니다.

```bash
sudo mkdir -p /data/overtime
sudo blkid /dev/disk/by-id/google-overtime-data || \
  sudo mkfs.ext4 -m 0 -F /dev/disk/by-id/google-overtime-data
echo '/dev/disk/by-id/google-overtime-data /data/overtime ext4 defaults,nofail 0 2' | \
  sudo tee -a /etc/fstab
sudo mount -a
sudo useradd --system --uid 10001 --home /nonexistent --shell /usr/sbin/nologin overtime || true
sudo chown -R 10001:10001 /data/overtime
```

Docker의 [Ubuntu 공식 설치 절차](https://docs.docker.com/engine/install/ubuntu/)대로 저장소를 추가한 뒤 Engine과 Compose 플러그인을 설치합니다.

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl sqlite3
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

로그아웃 후 다시 접속하고 `docker version`, `docker compose version`을 확인합니다.

## 5. 이미지를 로컬에서 빌드해 Artifact Registry에 푸시

e2-micro에서 빌드하면 메모리가 부족할 수 있으므로 개발 PC에서 `linux/amd64` 이미지를 빌드합니다.

```bash
export VERSION="$(git rev-parse --short HEAD)"
export REGISTRY="$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY"
gcloud auth configure-docker "$REGION-docker.pkg.dev"

docker buildx build --platform linux/amd64 \
  -f docker/api.Dockerfile \
  -t "$REGISTRY/overtime-api:$VERSION" --push .

docker buildx build --platform linux/amd64 \
  --build-arg VITE_GOOGLE_CLIENT_ID="YOUR_CLIENT_ID.apps.googleusercontent.com" \
  -f docker/web.Dockerfile \
  -t "$REGISTRY/overtime-web:$VERSION" --push .
```

장기 서비스 계정 JSON 키는 만들지 않습니다. 나중에 GitHub에서 자동 배포할 때는 [Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)을 사용하고 protected environment 승인을 둡니다.

## 6. 도메인 없는 1단계: 인프라 확인

Google Identity Services의 실제 운영 원본에는 승인된 도메인과 HTTPS가 필요합니다. 따라서 외부 IP의 HTTP 단계에서는 화면·Caddy·DB·헬스체크까지만 확인하고 Google 로그인은 완료 조건에 넣지 않습니다.

VM에서:

```bash
sudo mkdir -p /opt/overtime
sudo chown "$USER":"$USER" /opt/overtime
git clone YOUR_REPOSITORY_URL /opt/overtime
cd /opt/overtime

export REGISTRY="$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY"
export VERSION="THE_PUSHED_VERSION"
docker pull "$REGISTRY/overtime-api:$VERSION"
docker pull "$REGISTRY/overtime-web:$VERSION"
docker tag "$REGISTRY/overtime-api:$VERSION" overtime-api
docker tag "$REGISTRY/overtime-web:$VERSION" overtime-web
```

`EXTERNAL_IP`는 `gcloud compute instances describe`로 확인합니다. `.env`는 커밋하지 않습니다.

```dotenv
APP_ORIGIN=http://EXTERNAL_IP
GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
VITE_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
GOOGLE_HOSTED_DOMAIN=company.com
ADMIN_EMAILS=admin@company.com
SESSION_COOKIE_NAME=overtime_session
SESSION_TTL_DAYS=7
SESSION_HASH_SECRET=openssl-rand-hex-32-result
OVERTIME_UID=10001
OVERTIME_GID=10001
OVERTIME_DATA_DIR=/data/overtime
WEB_PORT=80
```

비밀값은 `openssl rand -hex 32`로 생성합니다.

```bash
docker compose up -d --no-build
docker compose ps
curl --fail http://EXTERNAL_IP/api/health
docker compose logs --tail=100 api web
```

API 시작 시 TypeORM 마이그레이션이 자동 실행됩니다.

## 7. 도메인 연결 후 운영 활성화

1. 도메인의 A 레코드를 VM 외부 IP로 지정합니다. VM을 중지·시작하면 임시 IP가 바뀔 수 있습니다. 고정 외부 IPv4는 별도 비용 가능성을 먼저 확인합니다.
2. `docker/Caddyfile.production`의 `DOMAIN` 값으로 Caddy가 80/443에서 인증서를 자동 발급할 수 있게 합니다.
3. Google OAuth 브랜딩의 홈페이지·개인정보 URL과 **승인된 JavaScript 원본**에 정확히 `https://overtime.example.com`을 등록합니다. 경로와 끝 슬래시는 넣지 않습니다.
4. Google Workspace 조직이라면 OAuth 대상을 Internal로 설정하고, 백엔드의 `GOOGLE_HOSTED_DOMAIN` 검증도 유지합니다.

`.env.production`:

```dotenv
APP_ORIGIN=https://overtime.example.com
DOMAIN=overtime.example.com
GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
GOOGLE_HOSTED_DOMAIN=company.com
ADMIN_EMAILS=admin@company.com
SESSION_COOKIE_NAME=overtime_session
SESSION_TTL_DAYS=7
SESSION_HASH_SECRET=openssl-rand-hex-32-result
API_IMAGE=us-west1-docker.pkg.dev/PROJECT/REPOSITORY/overtime-api:VERSION
WEB_IMAGE=us-west1-docker.pkg.dev/PROJECT/REPOSITORY/overtime-web:VERSION
```

```bash
docker compose --env-file .env.production -f compose.production.yaml pull
docker compose --env-file .env.production -f compose.production.yaml up -d --no-build
curl --fail https://overtime.example.com/api/health
docker compose --env-file .env.production -f compose.production.yaml ps
```

Google 로그인 팝업까지 확인하고 직원·관리자 계정으로 각각 권한을 점검합니다. Google 설정은 [웹 클라이언트 ID 공식 안내](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)를 기준으로 합니다.

## 8. 배포·롤백·로그

새 버전은 새 태그로만 푸시합니다. `latest` 덮어쓰기에 의존하지 않습니다.

```bash
# 배포
sed -i 's/:OLD_VERSION/:NEW_VERSION/g' .env.production
docker compose --env-file .env.production -f compose.production.yaml pull
docker compose --env-file .env.production -f compose.production.yaml up -d --no-build
curl --fail https://overtime.example.com/api/health

# 롤백: .env.production의 두 이미지 태그를 이전 값으로 되돌린 뒤
docker compose --env-file .env.production -f compose.production.yaml up -d --no-build

# 진단
docker compose --env-file .env.production -f compose.production.yaml logs --tail=200 api web
```

DB 스키마 변경이 포함된 버전은 마이그레이션의 하위 호환성을 먼저 검토하고 배포 직전 백업합니다. 앱 롤백이 DB 마이그레이션을 자동으로 되돌리지는 않습니다.

## 9. 운영 체크리스트

- 매일 백업 타이머와 최근 Cloud Storage 객체 확인
- 매달 별도 경로 복구 훈련
- 디스크 사용량 `df -h /data/overtime` 확인
- 예산 알림과 실제 청구 내역 확인
- 관리자 이메일 변경 시 재배포
- OS와 Docker 보안 업데이트
- 외부 22/3000 포트가 닫혀 있는지 확인
