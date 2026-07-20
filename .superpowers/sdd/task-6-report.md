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

## Review fixes: atomic publication, OCI rollback, and secret-safe argv

### RED

Expanded `docker/backup-restore.test.sh` before changing the implementation to
cover the review findings, then ran:

```text
bash docker/backup-restore.test.sh
```

Result: exit 1 at the new publication-interruption assertion. When the final
metadata move was forced to fail, the previous implementation left the new
`.dump` and `.dump.sha256` final paths visible.

The expanded contract also covers failures on OCI put 2 and put 3, successful
rollback deletion of every preceding put, explicit rollback-failure output,
absence of retention on all upload failures, and absence of the backup password
from both process output and captured host Docker argv.

### GREEN

- The metadata file is now the local set commit marker and is moved last.
- A timestamp-scoped atomic publish lock prevents concurrent publishers from
  owning the same final names.
- The exit trap removes all temporary and newly published final files if the
  metadata commit-marker move does not complete.
- OCI uploads metadata last as the remote commit marker.
- OCI put failure rolls back every already-uploaded object in reverse order.
- Rollback deletion failures are reported explicitly and leave the job failed
  for operator intervention.
- `PGPASSWORD` is assigned by a fixed `sh -c` inside the PostgreSQL container
  from its existing `POSTGRES_BACKUP_PASSWORD`; the host Docker argv contains no
  interpolated secret.

A second focused RED test fixed the clock and attempted to publish over a valid
set with the same timestamp. It failed with exit 1 and
`backup unexpectedly overwrote a committed same-timestamp set`. The publisher
now checks all final paths while holding the timestamp lock and rejects the
collision before creating or moving artifacts.

Final focused verification:

```text
bash -n docker/postgres-backup.sh docker/postgres-backup-oci.sh docker/backup-restore.test.sh
bash docker/backup-restore.test.sh
# PostgreSQL backup and OCI upload contract passed
bash deploy/oracle/systemd-units.test.sh
# oracle PostgreSQL backup systemd unit contract passed
git diff --check
```

All commands exited 0.
