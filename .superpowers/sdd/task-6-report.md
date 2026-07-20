# Task 6 report: PostgreSQL backup and OCI upload

## Scope

- Replaced the SQLite backup smoke test with a PostgreSQL shell contract test.
- Added a custom-format PostgreSQL backup producer and OCI instance-principal uploader.
- Updated only the backup systemd service/timer and their contract test.
- Did not access production or staging and did not implement Task 7.

## RED

After replacing `docker/backup-restore.test.sh`, ran:

```text
bash docker/backup-restore.test.sh
```

Result: exit 127 because `docker/postgres-backup-oci.sh` did not exist. This was
the expected missing-feature failure before implementation.

## GREEN

Implemented:

- `pg_dump --format=custom --no-owner --no-acl` through the Compose PostgreSQL container.
- `pg_restore --list` before publishing any final local artifact or invoking OCI.
- Same-filesystem temporary dump/checksum/metadata files, mode 0600, followed by `mv` to final names.
- Metadata containing only UTC timestamp, PostgreSQL major/minor version, and archive basename.
- `sha256sum -c` before upload.
- Three OCI uploads under `postgres/overtime-<UTC>.*`, each with `--auth instance_principal`.
- Local `-mtime +2` cleanup only after all three uploads succeed.
- Root systemd execution with a mode-0600 environment-file precondition and `UMask=0077`.
- KST schedule at 00:00, 06:00, 12:00, and 18:00.

The contract test also proves that validation failure does not upload or publish
partial files, upload failure does not run cleanup or remove an older valid set,
and the backup password is absent from captured stdout/stderr.

## Verification

Fresh final verification:

```text
bash -n docker/postgres-backup.sh docker/postgres-backup-oci.sh docker/backup-restore.test.sh deploy/oracle/systemd-units.test.sh
bash docker/backup-restore.test.sh
# PostgreSQL backup and OCI upload contract passed
bash deploy/oracle/systemd-units.test.sh
# oracle PostgreSQL backup systemd unit contract passed
git diff --check
```

All commands exited 0.
