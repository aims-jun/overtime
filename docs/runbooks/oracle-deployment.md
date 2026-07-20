# Oracle Always Free PostgreSQL 배포 실행서

이 문서는 `/opt/overtime`의 Compose 배포와 `/data`의 영속 데이터를 대상으로 한다. 프로덕션 접속 정보나 비밀값은 문서·shell history·Git에 남기지 않는다.

## 1. 인프라 preflight

Ubuntu 24.04 ARM64, 1 OCPU/6 GB VM과 50 GB data volume을 사용한다. NSG/UFW에는 관리자 IP의 22와 public 80/443만 열고 API 3000과 PostgreSQL 5432는 열지 않는다. 불필요한 Load Balancer를 만들지 않는다.

```bash
findmnt /data
df -h /data
free -h
docker version
docker compose version
```

볼륨은 device name을 눈대중으로 선택하지 말고 OCI attach 정보, `lsblk -f`, UUID를 대조한 뒤 `/etc/fstab`에 UUID로 등록한다.

## 2. PostgreSQL 디렉터리 소유권

official image 안의 `postgres` numeric UID/GID를 실행 중이 아닌 일회성 container로 확인한다. host에 임의의 999/10001을 가정하지 않는다.

```bash
mapfile -t PG_IDS < <(docker run --rm postgres:17.10-bookworm sh -c 'id -u postgres; id -g postgres')
PG_UID="${PG_IDS[0]}"
PG_GID="${PG_IDS[1]}"
test "$PG_UID" -ge 1
test "$PG_GID" -ge 1
sudo install -d -m 0700 -o "$PG_UID" -g "$PG_GID" /data/postgres
sudo install -d -m 0700 -o root -g root /data/overtime/postgres-backups
findmnt /data
ls -ldn /data/postgres /data/overtime/postgres-backups
```

## 3. 운영 비밀값과 role 분리

```bash
cd /opt/overtime
umask 077
cp deploy/oracle/production.env.example .env.production
install -m 0600 /dev/null .env.backup
for name in POSTGRES_ADMIN_PASSWORD POSTGRES_RUNTIME_PASSWORD POSTGRES_MIGRATION_PASSWORD POSTGRES_BACKUP_PASSWORD; do
  printf '%s=' "$name"
  openssl rand -hex 32
done
chmod 600 .env.production .env.backup
stat -c '%a %n' .env.production .env.backup
```

출력된 네 개의 64자 lowercase hex 값을 password manager에 보관하고 다음 용도로만 넣는다.

- admin: container init과 응급 관리
- runtime: `overtime_app`, API DML만
- migration: `overtime_migrator`, schema owner/migration만
- backup: `overtime_backup`, business table read-only dump만

hex는 URL-safe이므로 인코딩 없이 다음 형태로 `.env.production`에 조립한다. 아래 placeholder를 실제 문서나 커밋에 채우지 않는다.

```dotenv
POSTGRES_DATA_DIR=/data/postgres
POSTGRES_ADMIN_PASSWORD=<admin-hex>
POSTGRES_RUNTIME_PASSWORD=<runtime-hex>
POSTGRES_MIGRATION_PASSWORD=<migration-hex>
POSTGRES_BACKUP_PASSWORD=<backup-hex>
DATABASE_URL=postgresql://overtime_app:<runtime-hex>@postgres:5432/overtime
DATABASE_MIGRATION_URL=postgresql://overtime_migrator:<migration-hex>@postgres:5432/overtime
```

`.env.backup`에는 다음 항목만 넣고 backup password는 `.env.production`의 backup 값과 같게 설정한다.

```dotenv
POSTGRES_BACKUP_PASSWORD=<backup-hex>
OCI_BACKUP_BUCKET=<private-bucket-name>
BACKUP_DIR=/data/overtime/postgres-backups
COMPOSE_ENV_FILE=/opt/overtime/.env.production
COMPOSE_FILE=/opt/overtime/compose.production.yaml
```

## 4. 구성·포트·role 검증

```bash
docker compose --env-file .env.production -f compose.production.yaml config --quiet
docker compose --env-file .env.production -f compose.production.yaml up -d postgres
docker compose --env-file .env.production -f compose.production.yaml ps postgres
docker compose --env-file .env.production -f compose.production.yaml exec -T postgres pg_isready -U postgres -d overtime
ss -lnt
```

`ss -lnt`에 host `:5432` listener가 없어야 한다. Compose config에도 PostgreSQL `ports` mapping이 없어야 한다. init script는 최초의 빈 data directory에서만 role을 생성하므로, 기존 volume에 적용하려고 volume을 삭제하지 않는다.

schema migration은 API 시작과 분리해 명시적으로 실행한다.

```bash
set -a
. ./.env.production
set +a
docker compose --env-file .env.production -f compose.production.yaml run --rm --no-deps \
  -e DATABASE_MIGRATION_URL -e SQLITE_SOURCE_PATH=/not-used \
  api npm run db:migrate
docker compose --env-file .env.production -f compose.production.yaml exec -T postgres \
  psql --username postgres --dbname overtime --set=ON_ERROR_STOP=1 \
  --command='GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO overtime_backup;'
unset POSTGRES_ADMIN_PASSWORD POSTGRES_RUNTIME_PASSWORD POSTGRES_MIGRATION_PASSWORD POSTGRES_BACKUP_PASSWORD DATABASE_URL DATABASE_MIGRATION_URL
```

sequence가 없어도 위 grant는 성공한다. init 시 default sequence `SELECT`를 설정하지만, 이미 생성된 sequence 상태를 `pg_dump` backup role이 읽을 수 있게 매 schema migration 후 이 explicit grant를 반복한다. runtime role에는 sequence 권한을 주지 않는다.

## 5. SQLite에서 cutover

이관 전에 기존 SQLite API image/Compose/env를 root-only rollback directory에 보존한다. 유지보수 승인 후 API를 멈춘 상태에서 final snapshot을 `.backup`으로 만들고 integrity, users/records/sessions count, SHA-256를 기록한다. snapshot과 원본은 read-only로 전환하고 `retain_until=<snapshot UTC date + 30 days>`를 기록한다.

schema migration 후 final snapshot을 read-only mount해 이관한다.

```bash
docker compose --env-file .env.production -f compose.production.yaml run --rm --no-deps \
  -v /data/overtime/sqlite-archive:/migration-source:ro \
  -e SQLITE_SOURCE_PATH=/migration-source/<final-snapshot-name> \
  -e DATABASE_MIGRATION_URL \
  api npm run db:migrate:sqlite
```

source/target users·records ID/count/hash, target sessions 0, orphan 0, 집계, migration version을 독립 조회로 다시 확인한다. 검증 전에는 서비스를 재개하지 않는다.

rollback 경계는 서비스 재개다. 재개 전이고 PostgreSQL user write가 0일 때만 보존한 SQLite image/env로 복귀할 수 있다. 재개 후는 PostgreSQL이 source of truth이며 SQLite로 돌아가지 않는다. SQLite snapshot은 30일 동안 read-only로 보존한 뒤 별도 승인과 checksum 대조 후 폐기한다.

## 6. 백업과 임시 복구 증거

private OCI bucket에 `postgres/` prefix 30일 lifecycle을 설정하고 instance principal에 해당 bucket object 최소 권한만 부여한다.

```bash
sudo install -m 0644 deploy/oracle/overtime-backup.service deploy/oracle/overtime-backup.timer /etc/systemd/system/
sudo install -m 0644 deploy/oracle/overtime-restore-drill.service deploy/oracle/overtime-restore-drill.timer /etc/systemd/system/
sudo systemctl daemon-reload
systemd-analyze verify deploy/oracle/overtime-backup.service deploy/oracle/overtime-backup.timer deploy/oracle/overtime-restore-drill.service deploy/oracle/overtime-restore-drill.timer
sudo systemctl start overtime-backup.service
sudo systemctl show overtime-backup.service -p Result -p ExecMainStatus
sudo systemctl start overtime-restore-drill.service
sudo systemctl show overtime-restore-drill.service -p Result -p ExecMainStatus
sudo journalctl -u overtime-backup.service -u overtime-restore-drill.service --since today --no-pager
```

백업 성공 증거는 marker가 참조하는 exact `.dump`, `.dump.sha256`, `.metadata` 세 key, `Result=success`, `ExecMainStatus=0`이다. systemd restore service의 기본값은 local marker drill이므로 OCI 복구 증거가 아니다. Oracle acceptance는 `.env.backup`을 로드한 뒤 `RESTORE_METADATA_OBJECT=<exact remote marker>`를 지정한 manual remote marker drill을 별도로 실행하고 bucket, marker key, temporary DB, migration/count/FK/집계 통과, EXIT cleanup을 기록해야 한다. 이 두 증거를 보존한 뒤에만 timer를 켠다.

```bash
sudo systemctl enable --now overtime-backup.timer overtime-restore-drill.timer
systemctl list-timers overtime-backup.timer overtime-restore-drill.timer
```

## 7. 정기 배포

배포 전에 current commit, fresh backup marker, backup service 성공을 기록한다. `git pull --ff-only`, image build, explicit migration, API/web recreate, health check 순서를 지킨다. 앱 버전 rollback은 DB migration을 자동으로 되돌리지 않는다.

## 8. 복구

### 8.1 안전한 원격 backup 선택

exact OCI metadata key로 먼저 주간 훈련을 성공시킨다. 운영 DB 이름을 넘기면 script가 거부한다.

```bash
RESTORE_METADATA_OBJECT='postgres/overtime-<UTC>-<16-hex-run-id>.metadata' \
RESTORE_DATABASE="overtime_restore_drill_$(date -u +%Y%m%d%H%M%S)" \
OCI_BACKUP_BUCKET='<private-bucket-name>' \
./docker/postgres-restore-drill.sh
```

### 8.2 실제 장애 복구

이 절차는 주간 훈련과 별도다. 현재 상태의 fresh backup을 먼저 생성·upload하고 exact marker key를 기록한다.

```bash
sudo systemctl start overtime-backup.service
test "$(sudo systemctl show overtime-backup.service -p Result --value)" = success
test "$(sudo systemctl show overtime-backup.service -p ExecMainStatus --value)" = 0
```

복구할 marker 세트가 주간 훈련을 통과한 뒤 아래를 `/opt/overtime`에서 실행한다. 운영 DB를 덮어쓰지 않고 새 staging DB를 만든다. 실패하면 EXIT trap이 기존 env를 복원하고 API 재기동을 시도한다.

```bash
(
  set -eo pipefail
  test "$(stat -c %a /opt/overtime/.env.production)" = 600
  test "$(stat -c %a /opt/overtime/.env.backup)" = 600
  set -a
  . /opt/overtime/.env.production
  . /opt/overtime/.env.backup
  set +a
  set -u
  cd /opt/overtime
  read -r -p '정확한 OCI metadata key: ' RESTORE_METADATA_OBJECT
  read -r -p '새 target DB (overtime_restore_YYYYMMDDhhmmss): ' RESTORE_DATABASE
  read -r -p '복구 확인 (YES): ' CONFIRM_RESTORE
  if [[ "$RESTORE_DATABASE" == overtime || ! "$RESTORE_DATABASE" =~ ^overtime_restore_[0-9]{14}$ ]]; then echo '중지: 안전하지 않은 target DB' >&2; exit 1; fi
  if [[ "$CONFIRM_RESTORE" != YES ]]; then echo '중지: CONFIRM_RESTORE=YES가 필요합니다.' >&2; exit 1; fi
  [[ "$RESTORE_METADATA_OBJECT" =~ ^postgres/overtime-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{16}\.metadata$ ]]

  TMP="$(mktemp -d)"
  API_STOPPED=0
  CONFIG_SWITCHED=0
  cp .env.production "$TMP/env.production.before"
  restore_api_on_exit() {
    status=$?
    set +e
    if [[ "$API_STOPPED" == 1 ]]; then
      if [[ "$CONFIG_SWITCHED" == 1 ]]; then cp "$TMP/env.production.before" .env.production; chmod 600 .env.production; fi
      docker compose --env-file .env.production -f compose.production.yaml up -d api
    fi
    rm -rf "$TMP"
    exit "$status"
  }
  trap restore_api_on_exit EXIT

  METADATA="$TMP/$(basename "$RESTORE_METADATA_OBJECT")"
  oci os object get --auth instance_principal --bucket-name "$OCI_BACKUP_BUCKET" --name "$RESTORE_METADATA_OBJECT" --file "$METADATA"
  value() { sed -n "s/^$1=//p" "$METADATA"; }
  ARCHIVE_NAME="$(value archive)"
  DUMP_KEY="$(value remote_dump_key)"
  CHECKSUM_KEY="$(value remote_checksum_key)"
  USERS_COUNT="$(value users_count)"
  RECORDS_COUNT="$(value overtime_records_count)"
  [[ "$DUMP_KEY" == "${RESTORE_METADATA_OBJECT%.metadata}.dump" ]]
  [[ "$CHECKSUM_KEY" == "${RESTORE_METADATA_OBJECT%.metadata}.dump.sha256" ]]
  [[ "$USERS_COUNT" =~ ^[0-9]+$ && "$RECORDS_COUNT" =~ ^[0-9]+$ ]]
  ARCHIVE="$TMP/$ARCHIVE_NAME"
  CHECKSUM="$TMP/$ARCHIVE_NAME.sha256"
  oci os object get --auth instance_principal --bucket-name "$OCI_BACKUP_BUCKET" --name "$DUMP_KEY" --file "$ARCHIVE"
  oci os object get --auth instance_principal --bucket-name "$OCI_BACKUP_BUCKET" --name "$CHECKSUM_KEY" --file "$CHECKSUM"
  (cd "$TMP" && sha256sum -c "$(basename "$CHECKSUM")")
  docker compose --env-file .env.production -f compose.production.yaml exec -T postgres pg_restore --list < "$ARCHIVE"

  docker compose --env-file .env.production -f compose.production.yaml stop api
  API_STOPPED=1
  docker compose --env-file .env.production -f compose.production.yaml exec -T postgres sh -c 'exec createdb --username "$POSTGRES_USER" --owner overtime_migrator "$1"' sh "$RESTORE_DATABASE"
  docker compose --env-file .env.production -f compose.production.yaml exec -T postgres sh -c 'export PGPASSWORD="$POSTGRES_MIGRATION_PASSWORD"; exec pg_restore --exit-on-error --no-owner --no-acl --username overtime_migrator --dbname "$1"' sh "$RESTORE_DATABASE" < "$ARCHIVE"
  docker compose --env-file .env.production -f compose.production.yaml exec -T postgres psql --username postgres --dbname "$RESTORE_DATABASE" --set=ON_ERROR_STOP=1 --command='GRANT USAGE ON SCHEMA public TO overtime_app, overtime_backup; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO overtime_app; GRANT SELECT ON ALL TABLES IN SCHEMA public TO overtime_backup; GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO overtime_backup;'
  docker compose --env-file .env.production -f compose.production.yaml exec -T postgres psql --username postgres --dbname "$RESTORE_DATABASE" --set=ON_ERROR_STOP=1 --command='ALTER DEFAULT PRIVILEGES FOR ROLE overtime_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO overtime_app; ALTER DEFAULT PRIVILEGES FOR ROLE overtime_migrator IN SCHEMA public GRANT SELECT ON TABLES TO overtime_backup; ALTER DEFAULT PRIVILEGES FOR ROLE overtime_migrator IN SCHEMA public GRANT SELECT ON SEQUENCES TO overtime_backup;'
  docker compose --env-file .env.production -f compose.production.yaml exec -T postgres psql --username postgres --dbname "$RESTORE_DATABASE" --set=ON_ERROR_STOP=1 --command="BEGIN; SET ROLE overtime_app; SELECT COUNT(*) FROM users; INSERT INTO users (id, google_subject, email, name, last_login_at) SELECT '00000000-0000-0000-0000-000000000000'::uuid, 'privilege-probe', 'probe@example.invalid', 'probe', now() WHERE false; UPDATE users SET name = name WHERE false; DELETE FROM users WHERE false; ROLLBACK;"
  docker compose --env-file .env.production -f compose.production.yaml exec -T postgres psql --username postgres --dbname "$RESTORE_DATABASE" --set=ON_ERROR_STOP=1 --command='BEGIN; SET ROLE overtime_backup; SELECT COUNT(*) FROM users; ROLLBACK;'
  BACKUP_PROBE="$TMP/backup-role-probe.dump"
  docker compose --env-file .env.production -f compose.production.yaml exec -T postgres sh -c 'export PGPASSWORD="$POSTGRES_BACKUP_PASSWORD"; exec pg_dump --username overtime_backup --dbname "$1" --format=custom --no-owner --no-acl' sh "$RESTORE_DATABASE" > "$BACKUP_PROBE"
  docker compose --env-file .env.production -f compose.production.yaml exec -T postgres pg_restore --list < "$BACKUP_PROBE"
  COUNTS="$(docker compose --env-file .env.production -f compose.production.yaml exec -T postgres psql --username postgres --dbname "$RESTORE_DATABASE" --tuples-only --no-align --command='SELECT (SELECT COUNT(*) FROM users) || '\''|'\'' || (SELECT COUNT(*) FROM overtime_records);' | tr -d '[:space:]')"
  test "$COUNTS" = "$USERS_COUNT|$RECORDS_COUNT"

  sed -E "s#^(DATABASE(_MIGRATION)?_URL=postgresql://[^/]+/)[^?]+#\\1$RESTORE_DATABASE#" .env.production > "$TMP/env.production.next"
  chmod 600 "$TMP/env.production.next"
  docker compose --env-file "$TMP/env.production.next" -f compose.production.yaml config --quiet
  cp "$TMP/env.production.next" .env.production
  chmod 600 .env.production
  CONFIG_SWITCHED=1
  docker compose --env-file .env.production -f compose.production.yaml up -d api
  curl --fail --retry 10 --retry-delay 2 --retry-all-errors "https://$DOMAIN/api/health"
  API_STOPPED=0
  CONFIG_SWITCHED=0
  printf '복구 성공: marker=%s target=%s counts=%s\n' "$RESTORE_METADATA_OBJECT" "$RESTORE_DATABASE" "$COUNTS"
)
```

성공 후 marker, checksum, target, users/records count, migration version, orphan count, health check, 유실 가능 시간대를 기록한다. 이전 DB는 즉시 정리하지 말고 별도 승인 후 폐기한다.

## 9. 월별 점검

- OCI 실제 비용, Always Free 자격, 볼륨·Object Storage 사용량
- backup 6시간 timer, 최근 marker set, 30일 lifecycle, local 48시간 retention
- 주간 temporary restore journal과 정리 성공
- `/data/postgres` 용량·소유권, memory, container restart, host 5432 비노출
- API health, 로그인, 관리자 집계/CSV
