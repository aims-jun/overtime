# Oracle Always Free Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AIMS 추가근무 기록 서비스를 Oracle Always Free A1 VM, DuckDNS, Caddy, Docker Compose, SQLite, Oracle Object Storage에 월 운영비 없이 배포한다.

**Architecture:** Tokyo 홈 리전의 ARM64 Ubuntu VM 한 대에서 React 정적 웹, NestJS API, Caddy를 Docker Compose로 실행한다. SQLite는 별도 Block Volume에 저장하고, 일관된 SQLite 백업을 Oracle Object Storage에 매일 업로드한다. 소스는 비공개 GitHub 저장소에서 읽기 전용 Deploy Key로 내려받는다.

**Tech Stack:** Oracle Cloud Infrastructure Always Free, Ubuntu 24.04 ARM64, Docker Engine, Docker Compose, Caddy 2, React 19, NestJS 11, TypeORM, SQLite, OCI CLI, systemd, DuckDNS, Google Identity Services

## Global Constraints

- Oracle 홈 리전은 Japan East, Tokyo다.
- Compute는 `VM.Standard.A1.Flex` 1 OCPU, 6GB RAM과 Always Free Eligible Ubuntu 24.04 ARM64 이미지만 사용한다.
- 부팅 볼륨 50GB와 SQLite 전용 Block Volume 50GB만 사용한다.
- 유료 Load Balancer, 추가 VM, 유료 이미지, 유료 Block Volume을 만들지 않는다.
- 운영 주소는 `https://aims-overtime.duckdns.org`다.
- Google hosted domain은 `aimskr.com`, 관리자 이메일은 `contact@aimskr.com`이다.
- NestJS 3000번 포트를 외부에 공개하지 않는다.
- `.env.production`, 세션 비밀값, SQLite 파일, 백업, 개인 키는 Git에 커밋하지 않는다.
- 초기 배포는 수동으로 수행하며 GitHub Actions 자동 배포는 이번 범위에서 제외한다.
- 기존 GCP 백업과 배포 문서는 삭제하지 않고 Oracle 경로를 추가한다.

---

## File Structure

- Create: `docker/backup-oci.sh` — 기존의 검증된 SQLite 로컬 백업을 Oracle Object Storage에 업로드한다.
- Modify: `docker/backup-restore.test.sh` — OCI 업로드 명령과 인자 전달을 가짜 CLI로 검증한다.
- Create: `deploy/oracle/overtime-backup.service` — 매일 실행되는 백업 oneshot 서비스다.
- Create: `deploy/oracle/overtime-backup.timer` — 서울 시간 새벽 3시에 백업을 예약한다.
- Create: `deploy/oracle/systemd-units.test.sh` — systemd unit의 사용자, 환경 파일, 실행 파일, 일정을 정적으로 검증한다.
- Create: `deploy/oracle/production.env.example` — Oracle 운영에 필요한 비밀값 없는 환경변수 예시다.
- Create: `deploy/oracle/compose-config.test.sh` — 운영 Compose가 Oracle 환경에서 렌더링되고 3000번 포트를 공개하지 않는지 검증한다.
- Modify: `compose.production.yaml` — 데이터 경로를 `OVERTIME_DATA_DIR`로 설정 가능하게 하되 `/data/overtime`을 기본값으로 유지한다.
- Modify: `.gitignore` — Oracle 운영 환경과 OCI 키가 추적되지 않도록 명시한다.
- Create: `docs/runbooks/oracle-deployment.md` — 계정 이후 VM, GitHub, DuckDNS, OAuth, 배포, 롤백, 비용 점검 절차를 제공한다.
- Modify: `docs/runbooks/backup-restore.md` — GCP와 Oracle 백업·복구 경로를 각각 명시한다.
- Modify: `README.md` — Oracle 배포와 무료 운영 제약을 현재 운영 옵션으로 안내한다.

---

### Task 1: Oracle Object Storage 백업 어댑터

**Files:**
- Create: `docker/backup-oci.sh`
- Modify: `docker/backup-restore.test.sh`

**Interfaces:**
- Consumes: `docker/backup.sh`가 stdout으로 반환하는 검증 완료 SQLite 백업 파일 경로
- Produces: `OCI_BACKUP_BUCKET: string` 환경변수와 `oci os object put --auth instance_principal` 업로드 동작

- [ ] **Step 1: OCI 업로드가 아직 없어서 실패하는 테스트 작성**

`docker/backup-restore.test.sh`의 마지막 성공 메시지 앞에 아래 검증을 추가한다.

```bash
mkdir -p "$tmp/bin"
cat > "$tmp/bin/oci" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" > "$OCI_CALL_LOG"
EOF
chmod +x "$tmp/bin/oci"

OCI_CALL_LOG="$tmp/oci-call.log" \
PATH="$tmp/bin:$PATH" \
DATABASE_PATH="$tmp/source.sqlite" \
BACKUP_DIR="$tmp/oci-backups" \
BACKUP_RETENTION_DAYS=30 \
OCI_BACKUP_BUCKET=aims-overtime-backups \
  "$root/docker/backup-oci.sh"

grep -F -- 'os object put --auth instance_principal' "$tmp/oci-call.log"
grep -F -- '--bucket-name aims-overtime-backups' "$tmp/oci-call.log"
grep -F -- '--file ' "$tmp/oci-call.log"
grep -F -- '--force' "$tmp/oci-call.log"
```

- [ ] **Step 2: 테스트가 예상한 이유로 실패하는지 실행**

Run: `bash docker/backup-restore.test.sh`

Expected: FAIL with `docker/backup-oci.sh: No such file or directory`.

- [ ] **Step 3: 최소 OCI 백업 어댑터 구현**

`docker/backup-oci.sh`를 다음 내용으로 만든다.

```bash
#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: DATABASE_PATH=/path/db.sqlite BACKUP_DIR=/path/backups OCI_BACKUP_BUCKET=bucket ./docker/backup-oci.sh

Creates and verifies a local SQLite backup, then uploads it with an OCI
instance principal. BACKUP_RETENTION_DAYS defaults to 30.
EOF
  exit 0
fi

: "${DATABASE_PATH:?DATABASE_PATH is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"
: "${OCI_BACKUP_BUCKET:?OCI_BACKUP_BUCKET is required}"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
target="$(
  DATABASE_PATH="$DATABASE_PATH" \
  BACKUP_DIR="$BACKUP_DIR" \
  BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}" \
  SKIP_UPLOAD=1 \
    "$root/backup.sh"
)"

oci os object put \
  --auth instance_principal \
  --bucket-name "$OCI_BACKUP_BUCKET" \
  --name "$(basename "$target")" \
  --file "$target" \
  --force >/dev/null

echo "$target"
```

Run: `chmod +x docker/backup-oci.sh`

- [ ] **Step 4: 백업·복구·OCI 업로드 테스트 실행**

Run: `bash docker/backup-restore.test.sh`

Expected: PASS and final line `backup and restore smoke test passed`.

- [ ] **Step 5: 셸 구문 검사**

Run: `bash -n docker/backup.sh docker/backup-oci.sh docker/restore.sh docker/backup-restore.test.sh`

Expected: exit 0 with no output.

- [ ] **Step 6: 변경 커밋**

```bash
git add docker/backup-oci.sh docker/backup-restore.test.sh
git commit -m "feat: upload SQLite backups to OCI"
```

---

### Task 2: Oracle 백업 systemd 예약

**Files:**
- Create: `deploy/oracle/overtime-backup.service`
- Create: `deploy/oracle/overtime-backup.timer`
- Create: `deploy/oracle/systemd-units.test.sh`

**Interfaces:**
- Consumes: `/opt/overtime/.env.backup`, `/opt/overtime/docker/backup-oci.sh`, Linux 사용자 `overtime`
- Produces: `overtime-backup.timer`가 매일 `03:00 Asia/Seoul`에 실행하는 oneshot 백업

- [ ] **Step 1: systemd unit 계약 테스트 작성**

`deploy/oracle/systemd-units.test.sh`를 다음 내용으로 만든다.

```bash
#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
service="$root/deploy/oracle/overtime-backup.service"
timer="$root/deploy/oracle/overtime-backup.timer"

grep -Fx 'User=overtime' "$service"
grep -Fx 'EnvironmentFile=/opt/overtime/.env.backup' "$service"
grep -Fx 'ExecStart=/opt/overtime/docker/backup-oci.sh' "$service"
grep -Fx 'OnCalendar=*-*-* 03:00:00 Asia/Seoul' "$timer"
grep -Fx 'Persistent=true' "$timer"
grep -Fx 'WantedBy=timers.target' "$timer"

echo 'oracle systemd unit contract passed'
```

Run: `chmod +x deploy/oracle/systemd-units.test.sh`

- [ ] **Step 2: 테스트가 unit 파일 부재로 실패하는지 실행**

Run: `bash deploy/oracle/systemd-units.test.sh`

Expected: FAIL because `overtime-backup.service` does not exist.

- [ ] **Step 3: 백업 service unit 작성**

`deploy/oracle/overtime-backup.service`:

```ini
[Unit]
Description=AIMS overtime SQLite backup to OCI Object Storage
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=overtime
EnvironmentFile=/opt/overtime/.env.backup
ExecStart=/opt/overtime/docker/backup-oci.sh
```

- [ ] **Step 4: 백업 timer unit 작성**

`deploy/oracle/overtime-backup.timer`:

```ini
[Unit]
Description=Daily AIMS overtime backup

[Timer]
OnCalendar=*-*-* 03:00:00 Asia/Seoul
Persistent=true
RandomizedDelaySec=5m

[Install]
WantedBy=timers.target
```

- [ ] **Step 5: unit 계약과 문법 검사**

Run: `bash deploy/oracle/systemd-units.test.sh`

Expected: PASS and `oracle systemd unit contract passed`.

Run on a Linux host: `systemd-analyze verify deploy/oracle/overtime-backup.service deploy/oracle/overtime-backup.timer`

Expected: exit 0 without unit syntax errors. macOS에서는 이 명령을 건너뛰고 Oracle VM에서 반드시 실행한다.

- [ ] **Step 6: 변경 커밋**

```bash
git add deploy/oracle/overtime-backup.service deploy/oracle/overtime-backup.timer deploy/oracle/systemd-units.test.sh
git commit -m "ops: schedule Oracle SQLite backups"
```

---

### Task 3: Oracle 운영 환경과 Compose 계약

**Files:**
- Create: `deploy/oracle/production.env.example`
- Create: `deploy/oracle/compose-config.test.sh`
- Modify: `compose.production.yaml`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `OVERTIME_DATA_DIR` 환경변수, 기본값 `/data/overtime`
- Produces: DuckDNS 운영 원본과 Google 설정이 포함된 Compose 입력 예시, 외부 80/443만 공개하는 렌더링된 Compose

- [ ] **Step 1: Compose 계약 테스트 작성**

`deploy/oracle/compose-config.test.sh`를 다음 내용으로 만든다.

```bash
#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

docker compose \
  --env-file "$root/deploy/oracle/production.env.example" \
  -f "$root/compose.production.yaml" \
  config > "$tmp"

expected_data_dir="${EXPECTED_DATA_DIR:-/data/overtime}"
grep -F 'https://aims-overtime.duckdns.org' "$tmp"
grep -F "$expected_data_dir:/app/data:rw" "$tmp"
grep -F 'target: 80' "$tmp"
grep -F 'target: 443' "$tmp"
if grep -F 'published: "3000"' "$tmp"; then
  echo 'API port 3000 must not be published' >&2
  exit 1
fi

echo 'oracle compose contract passed'
```

Run: `chmod +x deploy/oracle/compose-config.test.sh`

- [ ] **Step 2: 데이터 경로 계약이 아직 없어서 실패하는지 실행**

Run: `OVERTIME_DATA_DIR=/tmp/not-the-default EXPECTED_DATA_DIR=/tmp/not-the-default bash deploy/oracle/compose-config.test.sh`

Expected: FAIL until `compose.production.yaml` consumes `OVERTIME_DATA_DIR` and the example supplies `/data/overtime`.

- [ ] **Step 3: 운영 환경 예시 작성**

`deploy/oracle/production.env.example`:

```dotenv
NODE_ENV=production
APP_ORIGINS=https://aims-overtime.duckdns.org
DOMAIN=aims-overtime.duckdns.org
GOOGLE_CLIENT_ID=277505331846-qutiqdb1qqe08gpit51mn5dv7hmr72sm.apps.googleusercontent.com
GOOGLE_HOSTED_DOMAIN=aimskr.com
ADMIN_EMAILS=contact@aimskr.com
SESSION_COOKIE_NAME=overtime_session
SESSION_TTL_DAYS=7
SESSION_HASH_SECRET=
OVERTIME_DATA_DIR=/data/overtime
```

Google 웹 클라이언트 ID는 브라우저 번들에 포함되는 공개 식별자다. Google 클라이언트 비밀번호는 이 프로젝트에서 사용하지 않으며 파일에 기록하지 않는다.

- [ ] **Step 4: Compose 데이터 경로를 환경변수화**

`compose.production.yaml`의 API bind mount를 다음과 같이 바꾼다.

```yaml
    volumes:
      - ${OVERTIME_DATA_DIR:-/data/overtime}:/app/data
```

- [ ] **Step 5: 운영 비밀값 ignore 규칙 명시**

`.gitignore` 마지막에 다음을 추가한다.

```gitignore
# Oracle production credentials and runtime state
.env.production
.env.backup
*.pem
*.key
```

- [ ] **Step 6: Compose 계약 검증**

Run: `bash deploy/oracle/compose-config.test.sh`

Expected: PASS and `oracle compose contract passed`.

Run: `git check-ignore .env.production .env.backup probe.pem probe.key`

Expected: all four paths are printed.

- [ ] **Step 7: 변경 커밋**

```bash
git add .gitignore compose.production.yaml deploy/oracle/production.env.example deploy/oracle/compose-config.test.sh
git commit -m "ops: configure Oracle production compose"
```

---

### Task 4: Oracle 배포 실행 문서

**Files:**
- Create: `docs/runbooks/oracle-deployment.md`

**Interfaces:**
- Consumes: GitHub 저장소 `aims-overtime`, DuckDNS 호스트 `aims-overtime.duckdns.org`, Task 1~3의 스크립트와 설정 파일
- Produces: 계정 생성 이후부터 VM, Block Volume, Docker, 배포, OAuth, 백업, 롤백까지 재현 가능한 절차

- [ ] **Step 1: 실행 문서가 반드시 포함할 계약 목록 작성**

문서 작성 전에 아래 문자열을 검사하는 명령을 기준으로 삼는다.

```bash
test -f docs/runbooks/oracle-deployment.md
rg -n 'VM.Standard.A1.Flex|1 OCPU|6 GB|Always Free Eligible|Ubuntu 24.04|50 GB|aims-overtime.duckdns.org|OVERTIME_DATA_DIR|instance_principal|contact@aimskr.com|aimskr.com|docker compose|api/health|Object Storage|복구' docs/runbooks/oracle-deployment.md
```

Expected before writing: FAIL because the file does not exist.

- [ ] **Step 2: 무료 리소스 생성 절차 작성**

`docs/runbooks/oracle-deployment.md`에 다음 결정을 정확히 설명한다.

```text
Home region: Japan East (Tokyo)
Image: Canonical Ubuntu 24.04, ARM64, Always Free Eligible
Shape: VM.Standard.A1.Flex
OCPU: 1
Memory: 6 GB
Boot volume: 50 GB
Data block volume: 50 GB
Public ports: TCP 22 from the administrator IP, TCP 80/443 from 0.0.0.0/0
Never create a Load Balancer for this deployment.
```

콘솔에서 예상 월 비용이 0으로 표시되고 각 대상에 Always Free Eligible 표시가 있는지 생성 버튼을 누르기 전에 확인하도록 한다. A1 용량 부족 오류가 발생하면 유료 shape로 바꾸지 않고 같은 Tokyo 리전에서 나중에 다시 시도하도록 한다.

- [ ] **Step 3: GitHub와 SSH 절차 작성**

로컬 GitHub CLI 흐름을 다음 명령으로 작성한다.

```bash
gh auth status
gh repo create aims-overtime --private --source=. --remote=origin --push
```

VM 접속 후 읽기 전용 Deploy Key 생성과 clone 절차를 다음과 같이 작성한다.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/aims_overtime_deploy -C aims-overtime-oracle -N ''
cat ~/.ssh/aims_overtime_deploy.pub
```

공개 키를 GitHub 저장소의 Settings → Deploy keys에 추가하되 `Allow write access`는 선택하지 않는다. `~/.ssh/config`에는 전용 키를 사용하는 `Host github.com-aims-overtime` 항목을 만들고 아래 주소로 clone한다.

```bash
read -r -p 'GitHub owner: ' GH_OWNER
git clone "git@github.com-aims-overtime:${GH_OWNER}/aims-overtime.git" /opt/overtime
```

VM에는 `gh`가 없으므로 prompt에는 로컬에서 `gh api user --jq .login`으로 확인한 owner를 입력한다고 명시한다.

- [ ] **Step 4: Block Volume과 Docker 설치 절차 작성**

Oracle 콘솔의 Attach 명령으로 iSCSI 연결을 완료한 뒤 `lsblk -f`로 새 장치를 식별하게 한다. 장치 경로를 임의로 가정하지 않고 아래 순서를 사용한다.

```bash
lsblk -f
sudo mkfs.ext4 -m 0 /dev/sdb
sudo mkdir -p /data/overtime
sudo blkid /dev/sdb
```

문서에서는 `/dev/sdb`를 `lsblk`로 확인한 실제 미포맷 50GB Block Volume일 때만 사용하도록 경고한다. `blkid`에서 얻은 UUID를 `/etc/fstab`에 `defaults,nofail`로 등록하고 다음을 검증한다.

```bash
sudo mount -a
findmnt /data/overtime
sudo useradd --system --uid 10001 --home /nonexistent --shell /usr/sbin/nologin overtime
sudo chown -R 10001:10001 /data/overtime
```

Docker는 Docker의 Ubuntu 공식 저장소 절차로 Engine, Buildx, Compose plugin을 설치하고 `docker version`, `docker compose version`으로 확인한다.

- [ ] **Step 5: 운영 환경과 첫 배포 절차 작성**

다음 명령을 포함한다.

```bash
cd /opt/overtime
cp deploy/oracle/production.env.example .env.production
openssl rand -hex 32
chmod 600 .env.production
docker compose --env-file .env.production -f compose.production.yaml config
docker compose --env-file .env.production -f compose.production.yaml up -d --build
docker compose --env-file .env.production -f compose.production.yaml ps
```

생성된 64자 비밀값을 `.env.production`의 빈 `SESSION_HASH_SECRET`에 넣은 뒤에만 Compose를 실행하도록 명시한다. `curl --fail https://aims-overtime.duckdns.org/api/health`가 성공할 때까지 로그 확인 명령도 포함한다.

- [ ] **Step 6: DuckDNS와 Google OAuth 절차 작성**

VM에서 공인 IP를 확인한다.

```bash
curl -fsS https://api.ipify.org
```

DuckDNS에서 `aims-overtime` 서브도메인을 만들고 해당 IP를 설정한다. DNS 확인은 다음 명령을 사용한다.

```bash
dig +short aims-overtime.duckdns.org
```

Google Cloud OAuth 웹 클라이언트의 승인된 JavaScript 원본에는 경로나 trailing slash 없이 정확히 다음 값만 추가한다.

```text
https://aims-overtime.duckdns.org
```

운영 환경은 `GOOGLE_HOSTED_DOMAIN=aimskr.com`, `ADMIN_EMAILS=contact@aimskr.com`을 유지한다. 대화 중 노출된 기존 OAuth 클라이언트 비밀번호는 Google Cloud Console에서 재설정하되, 이 앱은 비밀번호를 사용하지 않으므로 새 값은 서버나 GitHub 어디에도 저장하지 않는다고 명시한다.

- [ ] **Step 7: Object Storage instance principal과 timer 절차 작성**

`aims-overtime-backups` private bucket, VM instance를 식별하는 dynamic group, 해당 bucket의 object 관리만 허용하는 IAM policy를 만드는 콘솔 절차를 작성한다. VM에서 인증을 다음 명령으로 확인한다.

```bash
oci os ns get --auth instance_principal
```

백업 환경 파일과 unit 설치 명령을 포함한다.

```bash
sudo install -m 0644 deploy/oracle/overtime-backup.service /etc/systemd/system/
sudo install -m 0644 deploy/oracle/overtime-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now overtime-backup.timer
sudo systemctl start overtime-backup.service
sudo systemctl status overtime-backup.service --no-pager
sudo systemctl list-timers overtime-backup.timer
```

`/opt/overtime/.env.backup`의 정확한 내용은 다음과 같다.

```dotenv
DATABASE_PATH=/data/overtime/overtime.sqlite
BACKUP_DIR=/data/overtime/backups
BACKUP_RETENTION_DAYS=30
OCI_BACKUP_BUCKET=aims-overtime-backups
```

Bucket lifecycle rule은 `overtime-` prefix 객체를 30일 후 삭제하게 설정한다.

- [ ] **Step 8: 롤백·진단·0원 점검 절차 작성**

배포 전 백업, `git rev-parse HEAD` 기록, `git pull --ff-only`, 새 빌드, health check 순서를 작성한다. 롤백은 기록한 이전 SHA로 detached checkout하지 않고 `git switch --detach <sha>` 후 검증하고, 정상화 뒤 `git switch main`으로 복귀하도록 설명한다.

월별 0원 점검에는 다음을 포함한다.

- Compute shape와 OCPU/RAM이 Always Free 범위인지 확인
- boot + block volume 합계가 100GB인지 확인
- Object Storage가 20GB 미만인지 확인
- Load Balancer와 추가 유료 리소스가 없는지 확인
- Cost Analysis에서 실제 비용이 0인지 확인

- [ ] **Step 9: 문서 계약 검사와 커밋**

Run:

```bash
rg -n 'VM.Standard.A1.Flex|1 OCPU|6 GB|Always Free Eligible|Ubuntu 24.04|50 GB|aims-overtime.duckdns.org|OVERTIME_DATA_DIR|instance_principal|contact@aimskr.com|aimskr.com|docker compose|api/health|Object Storage|복구' docs/runbooks/oracle-deployment.md
```

Expected: every required topic has at least one match.

```bash
git add docs/runbooks/oracle-deployment.md
git commit -m "docs: add Oracle Always Free runbook"
```

---

### Task 5: 공통 운영 문서 연결

**Files:**
- Modify: `docs/runbooks/backup-restore.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: `docker/backup-oci.sh`, `docs/runbooks/oracle-deployment.md`
- Produces: GCP와 Oracle 중 배포 대상을 명확히 선택할 수 있는 프로젝트 진입 문서

- [ ] **Step 1: 현재 문서가 Oracle 경로를 누락하는지 검사**

Run: `rg -n 'Oracle|backup-oci|oracle-deployment' README.md docs/runbooks/backup-restore.md`

Expected: FAIL or incomplete matches before edits.

- [ ] **Step 2: 백업 문서를 공급자별로 분리해 갱신**

`docs/runbooks/backup-restore.md`에서 공통 SQLite 백업 원칙과 복구 절차는 유지한다. 기존 GCP Cloud Storage 절차에 `GCP` 소제목을 붙이고 Oracle 소제목에는 다음 수동 백업과 다운로드 복구 명령을 추가한다.

```bash
sudo -u overtime env \
  DATABASE_PATH=/data/overtime/overtime.sqlite \
  BACKUP_DIR=/data/overtime/backups \
  BACKUP_RETENTION_DAYS=30 \
  OCI_BACKUP_BUCKET=aims-overtime-backups \
  /opt/overtime/docker/backup-oci.sh

oci os object get \
  --auth instance_principal \
  --bucket-name aims-overtime-backups \
  --name overtime-20260714T000000Z.sqlite \
  --file /tmp/restore-source.sqlite

RESTORE_SOURCE=/tmp/restore-source.sqlite \
RESTORE_TARGET=/tmp/restore-drill.sqlite \
  ./docker/restore.sh
sqlite3 /tmp/restore-drill.sqlite 'PRAGMA integrity_check;'
```

예시 객체 이름은 형식을 보여주는 고정 예이며 실제 복구 시 `oci os object list`로 선택한다고 설명한다.

- [ ] **Step 3: README 운영 설명과 문서 링크 갱신**

README의 운영 항목을 `Docker Compose, Caddy, Oracle Cloud Always Free 또는 GCP Compute Engine`으로 수정한다. 주요 기능의 GCP 전용 문구를 공급자 중립적으로 바꾸고 문서 목록에 아래 링크를 추가한다.

```markdown
- [Oracle Always Free 배포](docs/runbooks/oracle-deployment.md)
```

무료 운영은 SLA와 인스턴스 회수 위험이 있고 회사 필수 시스템이 되면 유료 인프라를 검토해야 한다는 한 문장을 추가한다.

- [ ] **Step 4: 링크와 문서 계약 검사**

Run: `test -f docs/runbooks/oracle-deployment.md`

Expected: exit 0.

Run: `rg -n 'Oracle Always Free 배포|backup-oci.sh|instance_principal' README.md docs/runbooks/backup-restore.md`

Expected: README 링크와 Oracle 백업 명령이 출력된다.

- [ ] **Step 5: 변경 커밋**

```bash
git add README.md docs/runbooks/backup-restore.md
git commit -m "docs: document Oracle operations"
```

---

### Task 6: 전체 로컬 검증

**Files:**
- Verify only

**Interfaces:**
- Consumes: Task 1~5의 모든 코드, 운영 설정, 문서
- Produces: Oracle 외부 리소스를 만들기 전에 로컬에서 확인된 배포 후보 커밋

- [ ] **Step 1: 셸 계약 테스트 실행**

Run:

```bash
bash docker/backup-restore.test.sh
bash deploy/oracle/systemd-units.test.sh
bash deploy/oracle/compose-config.test.sh
```

Expected: 세 테스트 모두 PASS.

- [ ] **Step 2: 애플리케이션 전체 테스트 실행**

Run: `npm test`

Expected: API와 web unit test suites PASS.

Run: `npm run test:e2e -w apps/api -- --runInBand`

Expected: all API E2E suites PASS.

- [ ] **Step 3: lint와 production build 실행**

Run: `npm run lint`

Expected: exit 0 without lint errors.

Run: `npm run build`

Expected: NestJS and Vite production builds complete.

- [ ] **Step 4: Docker production 이미지 검증**

실제 비밀값은 사용하지 않고 로컬 전용 유효값을 가진 임시 환경 파일을 `/tmp/overtime-oracle-compose.env`에 만든다. Google 클라이언트 ID는 공개 ID를 사용하고 세션 비밀값은 `openssl rand -hex 32`로 생성한다.

Run:

```bash
cp deploy/oracle/production.env.example /tmp/overtime-oracle-compose.env
docker compose --env-file /tmp/overtime-oracle-compose.env -f compose.production.yaml build
```

Expected: API와 web production 이미지가 ARM64 호환 기반 이미지 정의로 끝까지 빌드된다. DuckDNS가 Oracle IP를 가리키기 전에는 로컬 Caddy가 공인 인증서를 발급할 수 없으므로 컨테이너 실행과 HTTPS health 검증은 Oracle VM에서 수행한다.

- [ ] **Step 5: 비밀값과 작업 트리 검사**

Run: `git status --short`

Expected: no uncommitted files.

Run: `git ls-files | rg '(^|/)(\.env\.production|\.env\.backup)$|\.sqlite($|-)|\.pem$|\.key$'`

Expected: no output.

---

### Task 7: GitHub와 Oracle 외부 리소스 생성

**Files:**
- External state only

**Interfaces:**
- Consumes: 검증 완료 main 브랜치, Oracle Cloud 계정, GitHub 계정
- Produces: 비공개 GitHub 저장소, Always Free VM, Block Volume, DuckDNS, Object Storage, IAM policy

- [ ] **Step 1: 비공개 GitHub 저장소 생성과 push**

Run: `gh auth status`

Expected: authenticated GitHub account is shown.

Run: `gh repo create aims-overtime --private --source=. --remote=origin --push`

Expected: repository URL is printed and `git remote -v` shows `origin`.

- [ ] **Step 2: Oracle A1 VM과 네트워크 생성**

`docs/runbooks/oracle-deployment.md`의 값으로 VM을 생성한다. 생성 직전 Always Free Eligible 표시와 예상 비용 0을 확인한다. SSH 접속 후 다음을 실행한다.

Run: `uname -m`

Expected: `aarch64`.

Run: `grep PRETTY_NAME /etc/os-release`

Expected: Ubuntu 24.04 LTS.

- [ ] **Step 3: Block Volume, Docker, 저장소 clone**

runbook 순서대로 50GB Block Volume을 `/data/overtime`에 마운트하고 Docker를 설치한 뒤 읽기 전용 Deploy Key로 `/opt/overtime`에 clone한다.

Run: `findmnt /data/overtime`

Expected: the attached block device is mounted at `/data/overtime`.

Run: `docker compose version`

Expected: Docker Compose v2 version.

- [ ] **Step 4: DuckDNS와 HTTPS 활성화**

DuckDNS에 `aims-overtime`을 만들고 VM 공인 IP를 연결한다.

Run: `dig +short aims-overtime.duckdns.org`

Expected: the Oracle VM public IPv4.

- [ ] **Step 5: Object Storage와 instance principal 구성**

runbook에 따라 private bucket, dynamic group, 최소 권한 policy를 만들고 OCI CLI를 설치한다.

Run: `oci os ns get --auth instance_principal`

Expected: tenancy Object Storage namespace JSON.

- [ ] **Step 6: 운영 환경 작성과 서비스 시작**

`/opt/overtime/.env.production`을 예시에서 만들고 안전한 세션 비밀값을 채운다.

Run:

```bash
docker compose --env-file .env.production -f compose.production.yaml up -d --build
docker compose --env-file .env.production -f compose.production.yaml ps
curl --fail https://aims-overtime.duckdns.org/api/health
```

Expected: api is healthy, web is running, health endpoint returns HTTP 200.

- [ ] **Step 7: Google OAuth 운영 원본 등록과 권한 검증**

Google Cloud Console에 `https://aims-overtime.duckdns.org`를 승인된 JavaScript 원본으로 추가한다. `@aimskr.com` 직원 계정, 비허용 개인 계정, `contact@aimskr.com` 관리자 계정으로 성공 기준을 각각 검증한다.

이 대화 이전에 외부로 노출된 Google OAuth 클라이언트 비밀번호는 Google Cloud Console에서 재설정한다. 현재 애플리케이션은 브라우저용 client ID와 백엔드 ID 토큰 검증만 사용하므로 새 클라이언트 비밀번호를 `.env.production`이나 저장소에 추가하지 않는다.

- [ ] **Step 8: 백업 timer와 실제 복구 시험**

systemd unit을 설치하고 수동 백업을 한 번 실행한다.

Run: `sudo systemctl start overtime-backup.service`

Expected: exit 0.

Run: `sudo journalctl -u overtime-backup.service --since today --no-pager`

Expected: uploaded backup path and no errors.

Object Storage 객체를 `/tmp/restore-source.sqlite`로 내려받고 `/tmp/restore-drill.sqlite`에 복구한다.

Run: `sqlite3 /tmp/restore-drill.sqlite 'PRAGMA integrity_check;'`

Expected: `ok`.

- [ ] **Step 9: 재시작과 비용 검증**

VM을 한 번 재부팅한 뒤 mount, Compose, HTTPS, 데이터 유지 여부를 확인한다. Oracle Cost Analysis에서 현재 비용이 0이고 생성된 모든 리소스가 설계 한도 안인지 확인한다.

---

### Task 8: 운영 인수 확인

**Files:**
- Verify only

**Interfaces:**
- Consumes: 배포된 AIMS 서비스와 운영 문서
- Produces: 직원 3명이 사용할 수 있는 검증 완료 배포

- [ ] **Step 1: 모바일 접속 검증**

Wi-Fi가 아닌 모바일 데이터에서 `https://aims-overtime.duckdns.org`를 열고 인증서 경고 없이 로그인 화면이 표시되는지 확인한다.

- [ ] **Step 2: 일반 직원 흐름 검증**

일반 `@aimskr.com` 계정으로 로그인해 30분 단위 시작·종료 시간으로 기록을 생성, 수정, 삭제한다. 컨테이너 재시작 후 기록이 남아 있는지 확인한다.

- [ ] **Step 3: 관리자 흐름 검증**

`contact@aimskr.com`으로 로그인해 관리자 화면으로 바로 이동하는지, 전체 내역과 시간 형식, CSV 다운로드가 정상인지 확인한다.

- [ ] **Step 4: 접근 거부 검증**

개인 Gmail 계정으로 로그인을 시도해 회사 계정 안내와 함께 거절되는지 확인한다.

- [ ] **Step 5: 운영 인수 기준 기록**

다음 결과를 작업 인수 메시지에 기록한다.

```text
Production URL
Deployed Git commit SHA
Oracle region and shape
Last successful health check time
Last successful backup object
Restore drill result
Google employee login result
Google admin login result
Unauthorized-domain rejection result
Current Oracle cost result
```

모든 항목이 성공한 뒤에만 배포 완료로 선언한다.
