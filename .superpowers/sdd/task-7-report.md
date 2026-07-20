# Task 7 report: weekly temporary PostgreSQL restore drill

## Scope

- Added a restore drill that targets only `overtime_restore_drill_<UTC digits>`.
- Consumes the newest completed local `.metadata` marker or an explicitly named
  unique OCI `.metadata` object.
- Added the Sunday 04:30 Asia/Seoul systemd schedule.
- Did not access production and did not implement Task 8.

## RED

Created `docker/postgres-restore-drill.test.sh` first and ran it. It exited 1
because `docker/postgres-restore-drill.sh` did not exist. The contract covers:

- hard rejection of `overtime` and every non-temporary target name;
- selection through completed `.metadata` markers only;
- exact timestamp/run-ID dump, checksum, and metadata key relationships;
- checksum and `pg_restore --list` validation before `createdb`;
- create, restore, migration/count/FK/report checks, then cleanup ordering;
- cleanup on an intermediate failure, with no production/source deletion.

The systemd contract then exited 2 because the restore drill units did not yet
exist. A focused latest-migration test also exited 1 with
`restore drill unexpectedly accepted an unknown latest migration` before the
expected migration check was implemented.

## GREEN

- Validates the target name before source discovery or Docker calls.
- Validates a selected commit marker and its exact unique object references,
  checksum file reference, SHA-256, and archive structure before database
  creation.
- Uses `createdb --owner overtime_migrator`, `pg_restore --exit-on-error
  --no-owner --no-acl`, and SQL checks for the current migration, archive counts,
  orphan foreign keys, and a basic report aggregation.
- Arms cleanup only after successful creation and drops only the validated
  temporary database with `dropdb --if-exists`, including on check failures.
- Downloads explicitly selected OCI marker/payload objects without deleting
  source objects; temporary downloads are removed locally.
- Schedules the oneshot service for Sunday 04:30 KST with persistence and a
  ten-minute randomized delay.

## Verification

Fresh final verification completed with exit 0:

```text
bash -n docker/postgres-restore-drill.sh docker/postgres-restore-drill.test.sh deploy/oracle/systemd-units.test.sh
bash docker/postgres-restore-drill.test.sh
# PostgreSQL restore drill safety contract passed
bash deploy/oracle/systemd-units.test.sh
# oracle PostgreSQL backup and restore drill systemd unit contract passed
bash docker/backup-restore.test.sh
# PostgreSQL backup and OCI upload contract passed
git diff --check
```

`systemd-analyze` is unavailable on this macOS host, so unit verification remains
an Oracle Linux VM preflight as specified in the task brief.
