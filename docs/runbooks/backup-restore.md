# SQLite 백업과 복구

## 백업 원칙

- 실행 중인 DB 파일을 `cp`로 복사하지 않습니다. WAL 파일과 시점이 어긋날 수 있습니다.
- `sqlite3 .backup`으로 일관된 스냅샷을 만들고 `PRAGMA integrity_check`를 통과한 파일만 보관합니다.
- 서버 디스크와 다른 장애 영역인 공급자별 비공개 객체 스토리지에도 복사합니다.
- 백업이 있다는 사실보다 **복구 훈련이 성공했다는 기록**이 중요합니다.

## 수동 백업

### GCP

VM 서비스 계정에는 대상 버킷의 `roles/storage.objectCreator`만 부여합니다.

```bash
sudo -u overtime env \
  DATABASE_PATH=/data/overtime/overtime.sqlite \
  BACKUP_DIR=/data/overtime/backups \
  BACKUP_BUCKET=PROJECT_ID-overtime-backup \
  BACKUP_RETENTION_DAYS=14 \
  /opt/overtime/docker/backup.sh
```

Cloud Storage 버킷은 공개 액세스 방지를 켜고, 90일 이후 삭제하는 수명 주기 규칙을 설정합니다. 보존 정책을 잠그기 전에 실제 운영 기간과 법적 요구사항을 먼저 확인하세요. 수명 주기 삭제는 비동기로 실행되며 즉시 삭제를 보장하지 않습니다.

### Oracle

OCI 인스턴스의 dynamic group에는 대상 비공개 버킷의 객체만 관리할 수 있는 최소 권한을 부여합니다. 수동 백업은 instance principal 인증으로 Object Storage에 업로드합니다.

```bash
sudo -u overtime env \
  DATABASE_PATH=/data/overtime/overtime.sqlite \
  BACKUP_DIR=/data/overtime/backups \
  BACKUP_RETENTION_DAYS=30 \
  OCI_BACKUP_BUCKET=aims-overtime-backups \
  /opt/overtime/docker/backup-oci.sh
```

버킷은 private으로 유지하고 이름 prefix `overtime-`인 객체를 30일 후 삭제하는 Lifecycle Policy를 설정합니다. dynamic group과 bucket 정책을 포함한 전체 설정은 [Oracle Always Free 배포 실행서](oracle-deployment.md)를 따릅니다.

## 매일 자동 백업

`/etc/systemd/system/overtime-backup.service`:

```ini
[Unit]
Description=Overtime SQLite backup

[Service]
Type=oneshot
User=overtime
Environment=DATABASE_PATH=/data/overtime/overtime.sqlite
Environment=BACKUP_DIR=/data/overtime/backups
Environment=BACKUP_BUCKET=PROJECT_ID-overtime-backup
Environment=BACKUP_RETENTION_DAYS=14
ExecStart=/opt/overtime/docker/backup.sh
```

`/etc/systemd/system/overtime-backup.timer`:

```ini
[Unit]
Description=Daily overtime backup timer

[Timer]
OnCalendar=*-*-* 03:00:00 Asia/Seoul
Persistent=true
RandomizedDelaySec=5m

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now overtime-backup.timer
systemctl list-timers overtime-backup.timer
journalctl -u overtime-backup.service
```

## 복구 훈련

먼저 운영 DB가 아닌 별도 경로에서 매달 한 번 확인합니다.

### GCP

```bash
gcloud storage cp gs://BUCKET/overtime-TIMESTAMP.sqlite /tmp/restore-source.sqlite
RESTORE_SOURCE=/tmp/restore-source.sqlite \
RESTORE_TARGET=/tmp/restore-drill.sqlite \
  ./docker/restore.sh
sqlite3 /tmp/restore-drill.sqlite 'PRAGMA integrity_check;'
```

### Oracle

먼저 버킷의 실제 객체를 나열해 복구할 객체 이름을 선택합니다. 아래 `overtime-20260714T000000Z.sqlite`는 이름 형식을 보여주는 예시일 뿐이며, 실제 복구에서는 목록에 있는 객체 이름으로 바꿉니다.

```bash
oci os object list \
  --auth instance_principal \
  --bucket-name aims-overtime-backups \
  --prefix overtime- \
  --query 'data[].name' \
  --output table

(
  set -euo pipefail
  RESTORE_TMP_DIR=$(mktemp -d)
  trap 'rm -rf "$RESTORE_TMP_DIR"' EXIT
  read -r -p '복구할 Object Storage 객체 이름: ' OCI_BACKUP_OBJECT
  if [[ ! "$OCI_BACKUP_OBJECT" =~ ^overtime-[0-9]{8}T[0-9]{6}Z\.sqlite$ ]]; then
    echo '중지: overtime-YYYYMMDDTHHMMSSZ.sqlite 형식의 객체 이름이 아닙니다.' >&2
    exit 1
  fi
  printf '선택한 복구 객체: %s\n' "$OCI_BACKUP_OBJECT"
  RESTORE_SOURCE="$RESTORE_TMP_DIR/$OCI_BACKUP_OBJECT"
  RESTORE_TARGET="$RESTORE_TMP_DIR/restore-drill.sqlite"
  oci os object get \
    --auth instance_principal \
    --bucket-name aims-overtime-backups \
    --name "$OCI_BACKUP_OBJECT" \
    --file "$RESTORE_SOURCE"
  test -s "$RESTORE_SOURCE"
  RESTORE_SOURCE="$RESTORE_SOURCE" RESTORE_TARGET="$RESTORE_TARGET" ./docker/restore.sh
  test "$(sqlite3 "$RESTORE_TARGET" 'PRAGMA integrity_check;')" = 'ok'
)
```

## 실제 장애 복구

쓰기 중 복구하지 않도록 순서를 지킵니다.

```bash
docker compose -f compose.production.yaml stop api

sudo RESTORE_SOURCE=/safe/overtime-TIMESTAMP.sqlite \
  RESTORE_TARGET=/data/overtime/overtime.sqlite \
  CONFIRM_RESTORE=YES \
  ./docker/restore.sh

sudo chown 10001:10001 /data/overtime/overtime.sqlite
docker compose -f compose.production.yaml up -d api
curl --fail https://YOUR_DOMAIN/api/health
```

복구 후 사용자 수, 최근 기록, 월 합계를 표본 확인하고 장애 시점 이후 유실 범위를 기록합니다.
