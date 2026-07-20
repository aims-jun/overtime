# PostgreSQL 백업과 복구

## 1. 백업 계약

`docker/postgres-backup-oci.sh`는 다음 세 개를 하나의 backup set으로 생성한다.

- `postgres/overtime-<UTC>-<16-hex-run-id>.dump`: `pg_dump --format=custom --no-owner --no-acl` archive
- 같은 prefix의 `.dump.sha256`: archive SHA-256
- 같은 prefix의 `.metadata`: timestamp, PostgreSQL major/minor, 정확한 세 OCI key, `users_count`, `overtime_records_count`

metadata는 마지막에 upload되는 commit marker다. marker가 없는 dump/checksum은 완료된 backup set이 아니다. 복구자는 bucket의 dump를 임의로 고르지 말고 정확한 `.metadata` key를 먼저 선택한 뒤 marker가 가리키는 dump/checksum만 사용한다. 중복 key가 하나라도 있으면 upload는 시작하지 않는다.

## 2. 자동화와 보존

Oracle systemd timer는 한국 시간 00:00, 06:00, 12:00, 18:00에, 즉 6시간마다 oneshot backup을 실행한다.

```bash
sudo systemctl enable --now overtime-backup.timer
systemctl list-timers overtime-backup.timer
sudo systemctl start overtime-backup.service
sudo systemctl show overtime-backup.service -p Result -p ExecMainStatus
sudo journalctl -u overtime-backup.service --since today --no-pager
```

`Result=success`와 `ExecMainStatus=0`을 모두 확인한다. OCI bucket은 private으로 유지하고 `postgres/` prefix의 객체를 30일 후 삭제하는 lifecycle rule을 설정한다. 서버의 `/data/overtime/postgres-backups`에서는 2일이 지난 `.dump`, `.dump.sha256`, `.metadata`를 script가 정리한다. OCI lifecycle은 local retention을 대신하지 않는다.

## 3. 주간 복구 훈련

매주 일요일 04:30 KST에 최근 commit marker를 임시 DB `overtime_restore_drill_<UTC digits>`로 복구한다. 운영 DB 이름과 형식에 맞지 않는 target은 script가 거부한다.

```bash
sudo systemctl enable --now overtime-restore-drill.timer
sudo systemctl start overtime-restore-drill.service
sudo systemctl show overtime-restore-drill.service -p Result -p ExecMainStatus
sudo journalctl -u overtime-restore-drill.service --since today --no-pager
```

수동으로 특정 OCI set를 훈련할 때는 목록에 실제로 있는 exact marker key를 사용한다.

```bash
sudo env \
  RESTORE_METADATA_OBJECT='postgres/overtime-<UTC>-<16-hex-run-id>.metadata' \
  RESTORE_DATABASE="overtime_restore_drill_$(date -u +%Y%m%d%H%M%S)" \
  /opt/overtime/docker/postgres-restore-drill.sh
```

script는 marker 참조, checksum, `pg_restore --list`, migration version, users/records count, orphan FK, 기본 집계를 검증하고 EXIT trap에서 자기가 생성한 임시 DB만 정리한다. journal의 marker key, 시각, count, 결과를 운영 기록에 남긴다.

## 4. 수동 복구 원칙

- 일반 수동 복구는 `RESTORE_DATABASE=ovetime_restore_...`가 아닌 `overtime_restore_<14 UTC digits>` 형식의 새 staging DB만 허용하며 `CONFIRM_RESTORE=YES`를 요구한다.
- checksum과 `pg_restore --list`를 DB 생성 전에 통과시키고, `createdb`로 fresh target을 만든 다음에만 restore한다.
- production recovery는 [Oracle 배포 실행서](oracle-deployment.md#82-실제-장애-복구)의 별도 절차다. 현재 DB를 overwrite하지 않고, 현재 상태의 fresh backup 성공과 운영자의 명시적 확인 없이는 시작하지 않는다.
- 장애 원인 분석을 위해 실패한 fresh target은 자동 삭제하지 않는다. 정리는 사후 변경 승인을 받아 target 이름을 다시 확인한 뒤 수행한다.

## 5. SQLite 이관 snapshot

PostgreSQL cutover 직전에 만든 최종 SQLite snapshot은 읽기 전용으로 30일 보존한다. 운영 기록에 snapshot 파일명, SHA-256, 생성 시각, `retain_until` 날짜, 원본 users/records/sessions count를 남긴다. 서비스 재개 전에만, PostgreSQL이 user write를 받지 않았을 때 SQLite rollback이 가능하다. 재개 후에는 PostgreSQL이 source of truth이며 이 snapshot으로 rollback하지 않는다.
