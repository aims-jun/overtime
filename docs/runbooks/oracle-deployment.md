# Oracle Always Free 배포 실행서

이 문서는 `aims-overtime`을 Oracle Cloud Infrastructure(OCI)의 무료 리소스 한도 안에서 `https://aims-overtime.duckdns.org`에 배포하는 운영 절차다. 초기 배포는 수동으로 수행하며 Load Balancer나 자동 배포용 GitHub Actions는 만들지 않는다.

## 1. 생성 전 고정값과 0원 확인

Oracle 계정의 Home region은 **Japan East (Tokyo)** 로 선택한다. 홈 리전은 가입 후 바꿀 수 없으므로 계정 생성 화면에서 다시 확인한다.

OCI Console의 **Compute → Instances → Create instance**에서 public subnet과 공인 IPv4를 사용하는 인스턴스를 만든다. 개발 PC의 SSH 공개 키를 등록하고, private key는 로컬에서만 보관한다. 다음 값을 사용한다.

- Image: Canonical Ubuntu 24.04, ARM64, `Always Free Eligible`
- Shape: `VM.Standard.A1.Flex`
- CPU와 메모리: `1 OCPU`, `6 GB`
- Boot volume: `50 GB`
- 별도 Data block volume: `50 GB`
- TCP 22: 관리자 현재 공인 IP에서만 허용
- TCP 80/443: `0.0.0.0/0`에서 허용
- TCP 3000: 외부에 공개하지 않음

인스턴스와 볼륨의 **Create** 버튼을 누르기 전에 각 대상에 `Always Free Eligible` 표시가 있고 예상 월 비용이 0인지 확인한다. 이 배포를 위해 Load Balancer를 만들지 않는다. A1 용량 부족 오류가 발생해도 유료 shape로 바꾸거나 다른 유료 리소스를 만들지 말고, 같은 Tokyo 리전에서 나중에 다시 시도한다.

VCN의 Network Security Group 또는 Security List에는 위 포트만 연다. Ubuntu 방화벽을 함께 쓴다면 SSH 접속을 잃지 않도록 관리자 IP의 22번 규칙을 먼저 적용한 뒤 80/443을 허용한다.

생성 후 콘솔에 표시된 공인 IP와 등록한 개인 키로 SSH 접속을 확인한다.

```bash
ssh -i /path/to/oracle-private-key ubuntu@<VM_PUBLIC_IP>
```

## 2. 비공개 GitHub 저장소 준비

이 단계는 **개발 PC의 저장소 루트**에서 실행한다. GitHub CLI는 개발 PC에서만 사용하며 VM에 `gh`가 있다고 가정하지 않는다.

```bash
gh auth status
gh api user --jq .login
gh repo create aims-overtime --private --source=. --remote=origin --push
```

두 번째 명령이 출력한 GitHub owner를 기록해 둔다. 저장소가 이미 만들어졌다면 새로 만들지 말고 기존 private 저장소의 remote와 push 상태를 확인한다.

Oracle VM에 SSH로 접속해 clone 전용 키를 만든다.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/aims_overtime_deploy -C aims-overtime-oracle -N ''
cat ~/.ssh/aims_overtime_deploy.pub
```

출력된 **공개 키만** GitHub 저장소의 **Settings → Deploy keys → Add deploy key**에 추가한다. `Allow write access`는 선택하지 않는다. 개인 키는 VM 밖이나 GitHub에 복사하지 않는다.

VM의 `~/.ssh/config`에 다음 전용 Host를 추가하고 권한을 제한한다.

```sshconfig
Host github.com-aims-overtime
  HostName github.com
  User git
  IdentityFile ~/.ssh/aims_overtime_deploy
  IdentitiesOnly yes
```

```bash
chmod 600 ~/.ssh/config ~/.ssh/aims_overtime_deploy
ssh -T git@github.com-aims-overtime
sudo install -d -o "$USER" -g "$USER" /opt/overtime
read -r -p 'GitHub owner: ' GH_OWNER
git clone "git@github.com-aims-overtime:${GH_OWNER}/aims-overtime.git" /opt/overtime
```

`GitHub owner` 프롬프트에는 개발 PC에서 `gh api user --jq .login`으로 확인한 값을 입력한다. VM에서 `gh`를 설치하거나 임의의 owner를 가정하지 않는다. `ssh -T`가 인증 성공 메시지 뒤 비대화형 셸 관련 종료 코드를 반환할 수 있으므로, 메시지에서 올바른 GitHub 계정으로 인증됐는지 확인한다.

## 3. 50GB Block Volume 연결과 마운트

OCI 콘솔에서 같은 Availability Domain에 `50 GB` Block Volume을 만들고 `Always Free Eligible` 및 예상 월 비용 0을 확인한다. 인스턴스에 **Attached** 상태로 연결한 다음, 콘솔의 **iSCSI commands & information**에 표시된 Attach 명령을 VM에서 그대로 실행한다.

먼저 장치를 식별한다.

```bash
lsblk -f
```

> **데이터 손실 경고:** 다음 `mkfs`는 지정한 장치의 내용을 모두 지운다. `/dev/sdb`라는 이름을 임의로 가정하지 않는다. `lsblk -f`의 크기, 연결 시점, 빈 `FSTYPE`을 대조해 **방금 연결한 미포맷 50GB Block Volume**임을 확실히 확인한 경우에만 아래 `/dev/sdb`를 실제 장치 경로로 바꿔 실행한다. 부팅 디스크, 파티션, 이미 파일시스템이나 데이터가 있는 장치에는 절대 실행하지 않는다. 확신이 없으면 여기서 멈추고 OCI Attach 정보와 `lsblk -f` 출력을 다시 확인한다.

확인된 실제 장치가 `/dev/sdb`일 때만 다음 순서로 진행한다.

```bash
lsblk -f
sudo mkfs.ext4 -m 0 /dev/sdb
sudo mkdir -p /data/overtime
sudo blkid /dev/sdb
```

`blkid`가 출력한 UUID를 복사해 `/etc/fstab`에 등록한다. 장치 경로 대신 UUID를 사용한다.

```fstab
UUID=실제-blkid-UUID /data/overtime ext4 defaults,nofail 0 2
```

마운트와 권한을 확인한다.

```bash
sudo mount -a
findmnt /data/overtime
sudo useradd --system --uid 10001 --home /nonexistent --shell /usr/sbin/nologin overtime
sudo chown -R 10001:10001 /data/overtime
id overtime
ls -ldn /data/overtime
```

`overtime` 사용자가 이미 있으면 `useradd`를 반복하지 말고 `id overtime`으로 UID가 10001인지 확인한다. `findmnt`의 source가 등록한 UUID의 50GB 볼륨인지 확인한 후에 배포를 계속한다.

## 4. Docker와 필수 도구 설치

Docker의 Ubuntu 공식 저장소를 사용해 Engine, Buildx, Compose plugin을 설치한다.

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl dnsutils git openssl sqlite3
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

로그아웃 후 다시 SSH로 접속해 확인한다.

```bash
docker version
docker compose version
```

## 5. DuckDNS와 Google OAuth 설정

VM의 현재 공인 IPv4를 확인한다.

```bash
curl -fsS https://api.ipify.org
```

DuckDNS에 로그인해 `aims-overtime` 서브도메인을 만들고 이 IPv4를 지정한다. DuckDNS token은 GitHub나 저장소 파일에 기록하지 않는다. DNS가 전파된 뒤 결과가 VM 공인 IP와 같은지 확인한다.

```bash
dig +short aims-overtime.duckdns.org
```

Google Cloud Console에서 이 앱의 OAuth 2.0 **웹 애플리케이션** 클라이언트를 열고 승인된 JavaScript 원본에 다음 값만 정확히 추가한다. 경로와 trailing slash는 붙이지 않는다.

```text
https://aims-overtime.duckdns.org
```

운영 환경은 `GOOGLE_HOSTED_DOMAIN=aimskr.com`, `ADMIN_EMAILS=contact@aimskr.com`을 유지한다. 대화 중 노출된 기존 Google OAuth 클라이언트 비밀번호(client secret)는 Google Cloud Console에서 즉시 재설정해 기존 값을 폐기한다. 이 앱은 Google client secret을 사용하지 않으므로 **기존 값과 새 값 모두 GitHub, `.env.production`, VM의 다른 파일이나 메모에 저장하지 않는다.** 저장소에 있는 `GOOGLE_CLIENT_ID`는 브라우저용 공개 식별자이며 client secret이 아니다.

## 6. 운영 환경과 첫 배포

VM에서 환경 파일을 만들고 세션 해시 비밀값을 생성한다.

```bash
cd /opt/overtime
cp deploy/oracle/production.env.example .env.production
openssl rand -hex 32
chmod 600 .env.production
```

`openssl`이 출력한 64자 값을 `.env.production`의 빈 `SESSION_HASH_SECRET=` 뒤에 넣는다. 이 값은 Git에 커밋하거나 외부에 공유하지 않는다. `APP_ORIGINS`, `DOMAIN`, `GOOGLE_HOSTED_DOMAIN`, `ADMIN_EMAILS`, `OVERTIME_DATA_DIR`가 각각 아래 운영값인지도 확인한다.

```dotenv
APP_ORIGINS=https://aims-overtime.duckdns.org
DOMAIN=aims-overtime.duckdns.org
GOOGLE_HOSTED_DOMAIN=aimskr.com
ADMIN_EMAILS=contact@aimskr.com
OVERTIME_DATA_DIR=/data/overtime
```

`SESSION_HASH_SECRET`가 여전히 비어 있으면 Compose를 실행하지 않는다. 설정을 렌더링한 뒤 VM에서 ARM64 이미지를 직접 빌드하고 시작한다.

```bash
docker compose --env-file .env.production -f compose.production.yaml config
docker compose --env-file .env.production -f compose.production.yaml up -d --build
docker compose --env-file .env.production -f compose.production.yaml ps
```

HTTPS 인증서가 발급되고 API가 정상화될 때까지 상태와 로그를 확인한다.

```bash
docker compose --env-file .env.production -f compose.production.yaml logs --tail=200 api web
curl --fail https://aims-overtime.duckdns.org/api/health
```

health check가 실패하면 다음 순서로 진단한다.

1. `dig +short aims-overtime.duckdns.org`와 VM 공인 IP가 같은지 확인한다.
2. OCI VCN/NSG와 Ubuntu 방화벽의 TCP 80/443 규칙을 확인한다. 외부 TCP 3000 규칙은 만들지 않는다.
3. `docker compose ... ps`에서 API healthcheck와 컨테이너 재시작 여부를 확인한다.
4. 위 `logs` 명령으로 Caddy 인증서, reverse proxy, NestJS 환경 변수와 migration 오류를 확인한다.
5. `findmnt /data/overtime`, `df -h /data/overtime`, `ls -ldn /data/overtime`으로 마운트와 UID 10001 쓰기 권한을 확인한다.
6. Google 로그인만 실패하면 승인된 JavaScript 원본과 `APP_ORIGINS`가 정확히 일치하는지 확인한다.

직원 `@aimskr.com` 계정으로 등록·조회하고, `contact@aimskr.com` 계정이 관리자 화면으로 이동하는지 확인한다. 허용되지 않은 도메인 계정은 거절되어야 한다.

## 7. Object Storage와 instance principal 백업

OCI 콘솔에서 다음 리소스를 만든다.

1. Object Storage에서 `aims-overtime-backups` 이름의 **private** Standard bucket을 같은 홈 리전에 만든다. Public access는 허용하지 않는다.
2. Identity & Security → Dynamic Groups에서 VM instance OCID 하나만 식별하는 dynamic group(예: `aims-overtime-backup-instances`)을 만든다. matching rule은 `instance.id = '<VM_INSTANCE_OCID>'`로 제한한다.
3. Identity & Security → Policies에서 해당 dynamic group이 지정 bucket의 object만 관리하도록 정책을 만든다. compartment와 dynamic group 이름은 실제 이름으로 바꾼다.

```text
Allow dynamic-group aims-overtime-backup-instances to manage objects in compartment <COMPARTMENT_NAME> where target.bucket.name = 'aims-overtime-backups'
```

이 정책에는 bucket 관리나 다른 리소스 권한을 추가하지 않는다. 정책 전파에는 몇 분이 걸릴 수 있다.

OCI CLI는 systemd 서비스의 `overtime` 사용자도 실행할 수 있도록 `/usr/local/bin/oci`에 설치한다. Oracle의 공식 OCI CLI 설치 스크립트 내용을 확인한 뒤 다음과 같이 시스템 경로에 설치한다.

```bash
curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh -o /tmp/install-oci-cli.sh
less /tmp/install-oci-cli.sh
sudo bash /tmp/install-oci-cli.sh --accept-all-defaults --install-dir /opt/oci-cli --exec-dir /usr/local/bin
oci --version
oci os ns get --auth instance_principal
```

마지막 명령이 instance principal로 namespace를 반환하는지 확인한다. 로컬 OCI API key나 config 파일을 만들 필요가 없다.

`/opt/overtime/.env.backup`을 만들고 편집한다.

```bash
sudo install -m 0600 -o overtime -g overtime /dev/null /opt/overtime/.env.backup
sudoedit /opt/overtime/.env.backup
```

파일에는 다음 **정확한 내용만** 넣는다.

```dotenv
DATABASE_PATH=/data/overtime/overtime.sqlite
BACKUP_DIR=/data/overtime/backups
BACKUP_RETENTION_DAYS=30
OCI_BACKUP_BUCKET=aims-overtime-backups
```

```bash
sudo chown overtime:overtime /opt/overtime/.env.backup
sudo chmod 600 /opt/overtime/.env.backup
sudo install -m 0644 deploy/oracle/overtime-backup.service /etc/systemd/system/
sudo install -m 0644 deploy/oracle/overtime-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now overtime-backup.timer
sudo systemctl start overtime-backup.service
sudo systemctl status overtime-backup.service --no-pager
sudo systemctl list-timers overtime-backup.timer
```

Oracle VM에서 unit 문법도 검증한다.

```bash
systemd-analyze verify deploy/oracle/overtime-backup.service deploy/oracle/overtime-backup.timer
journalctl -u overtime-backup.service --since today --no-pager
```

Bucket의 Lifecycle Policy에 이름 prefix `overtime-`인 객체를 **30일 후 삭제**하는 규칙을 추가한다. 로컬 백업도 스크립트의 `BACKUP_RETENTION_DAYS=30`에 따라 정리된다. Object Storage 객체 목록에서 `overtime-YYYYMMDDTHHMMSSZ.sqlite`가 생성됐는지 확인한다.

## 8. 백업 복구 훈련과 실제 복구

매달 한 번 Object Storage 백업을 운영 DB와 다른 임시 경로에 내려받아 복구 훈련을 한다. 객체 이름은 실제 최근 백업으로 바꾼다.

```bash
oci os object get --auth instance_principal --bucket-name aims-overtime-backups --name overtime-TIMESTAMP.sqlite --file /tmp/restore-source.sqlite
rm -f /tmp/restore-drill.sqlite
RESTORE_SOURCE=/tmp/restore-source.sqlite RESTORE_TARGET=/tmp/restore-drill.sqlite ./docker/restore.sh
sqlite3 /tmp/restore-drill.sqlite 'PRAGMA integrity_check;'
```

결과가 `ok`인지 확인하고 날짜, 객체 이름, 결과를 운영 기록에 남긴다. 실제 장애 복구는 API 쓰기를 멈춘 뒤 수행한다.

```bash
docker compose --env-file .env.production -f compose.production.yaml stop api
sudo RESTORE_SOURCE=/tmp/restore-source.sqlite RESTORE_TARGET=/data/overtime/overtime.sqlite CONFIRM_RESTORE=YES ./docker/restore.sh
sudo chown 10001:10001 /data/overtime/overtime.sqlite
docker compose --env-file .env.production -f compose.production.yaml up -d api
curl --fail https://aims-overtime.duckdns.org/api/health
```

복구 뒤 사용자 수, 최근 기록과 월 합계를 표본 확인하고 유실 가능 시간대를 기록한다. 앱 버전 롤백은 DB migration을 자동으로 되돌리지 않으므로, 스키마 변경 장애라면 배포 전 백업으로 DB까지 복구할지 별도로 판단한다.

## 9. 정기 배포와 롤백

정기 배포 전에는 현재 DB 백업 성공과 현재 커밋 SHA를 먼저 기록한다.

```bash
cd /opt/overtime
sudo systemctl start overtime-backup.service
sudo systemctl status overtime-backup.service --no-pager
git rev-parse HEAD
git pull --ff-only
docker compose --env-file .env.production -f compose.production.yaml up -d --build
docker compose --env-file .env.production -f compose.production.yaml ps
curl --fail https://aims-overtime.duckdns.org/api/health
```

`git rev-parse HEAD`의 배포 전 SHA와 생성된 Object Storage 백업 이름을 운영 기록에 남긴다. health check가 실패하면 로그를 확인하고 기록한 이전 SHA로 롤백한다.

```bash
git switch --detach <PREVIOUS_SHA>
docker compose --env-file .env.production -f compose.production.yaml up -d --build
docker compose --env-file .env.production -f compose.production.yaml ps
curl --fail https://aims-overtime.duckdns.org/api/health
docker compose --env-file .env.production -f compose.production.yaml logs --tail=200 api web
```

롤백 검증 중에는 `git checkout <sha>` 대신 의도가 명확한 `git switch --detach <sha>`를 사용한다. 정상화 후 다음 배포를 준비할 때 브랜치로 복귀한다.

```bash
git switch main
git pull --ff-only
```

## 10. 월별 0원·운영 점검

매달 OCI Console과 VM에서 다음을 확인하고 기록한다.

- Compute가 `VM.Standard.A1.Flex`, `1 OCPU`, `6 GB`이며 계속 Always Free 범위인지 확인한다.
- boot `50 GB` + block `50 GB`, 합계 `100GB`이고 추가 boot/block volume이나 유료 backup/snapshot이 없는지 확인한다.
- `aims-overtime-backups` Object Storage 사용량이 `20GB` 미만이며 `overtime-` 30일 lifecycle rule이 동작하는지 확인한다.
- Load Balancer, 추가 VM, 유료 shape/image, 추가 공인 IP 등 의도하지 않은 유료 리소스가 없는지 확인한다.
- Billing & Cost Management의 Cost Analysis에서 실제 비용이 0인지 확인한다. `Always Free Eligible` 표시는 실제 비용 확인을 대신하지 않는다.
- `sudo systemctl list-timers overtime-backup.timer`, 최근 service journal, 최근 Object Storage 객체를 확인한다.
- `df -h /data/overtime`로 데이터와 로컬 백업 사용량을 확인하고, 별도 경로 복구 훈련을 월 1회 수행한다.
- `curl --fail https://aims-overtime.duckdns.org/api/health`와 직원/관리자 로그인을 확인한다.

Always Free 정책과 한도는 바뀔 수 있다. 월별 점검 때 OCI의 최신 Always Free 조건도 함께 확인하며, Oracle의 장기 유휴 A1 회수 가능성, 무료 서비스와 DuckDNS의 SLA 부재를 운영 위험으로 유지한다.
