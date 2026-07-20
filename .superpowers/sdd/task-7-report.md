# Task 7 code review

## Findings

### [P1] Checksum filename validation is not exact

`docker/postgres-restore-drill.sh:131-136` interpolates `archive_name` directly
into a Bash regular expression. The validated archive name contains a literal
`.` before `dump`, but in the regex that dot matches any character. For example,
a checksum line naming `overtime-20260720T000000ZXdump` is accepted by the regex.
On the local path, if that alternate file exists, `sha256sum -c` validates the
alternate file while the script subsequently feeds the canonical `.dump` file
to `pg_restore`. A corrupt or substituted restore payload can therefore bypass
the required SHA-256 validation. The checksum filename should be parsed and
compared as a literal string (or the regex input must be escaped), and a negative
test should cover a one-character filename substitution.

### [P1] Scheduled drills do not compare restored row counts to a baseline

`docker/postgres-restore-drill.sh:163-180` queries restored `users` and
`overtime_records` counts, but only compares them when count metadata or both
`EXPECTED_*` environment variables are present. The producer at
`docker/postgres-backup.sh:80-82` writes neither count, and the systemd service
does not provide either override. Consequently the normal weekly path leaves
both expected values empty and accepts any syntactically valid count, including
`0|0`; it does not satisfy the required "counts match metadata or archive query"
check. Record the source counts in the committed metadata (or otherwise capture
an authenticated baseline) and make their presence and exact match mandatory.
The fake-Docker happy path should also prove that a mismatched count fails.

## Scope checks

- Target validation occurs before discovery or Docker calls; `overtime` and
  names outside `overtime_restore_drill_<digits>` are rejected.
- Marker selection, timestamp/run-ID/object-key relationships, archive-list
  validation before `createdb`, create/restore/check/drop ordering, migration,
  orphan-FK, report query, and the requested timer values are present.
- Cleanup is armed only after successful `createdb`, drops only the captured
  validated target with `dropdb --if-exists`, and converts a drop failure into a
  failing exit status. The tests cover check-failure cleanup but not an actual
  `dropdb` failure.
- No source-object deletion command is present in the restore script.

## Verification performed

Read-only review of `b418eb4..b1f32a7`, the Task 7 brief, the backup producer,
schema/migration references, and unit files. Per instruction, no broad test suite
was rerun. `git diff --check b418eb4..b1f32a7` produced no errors. A focused Bash
expression probe confirmed that the malformed `...ZXdump` checksum filename is
accepted by the current regex.

## Task quality verdict

**CHANGES REQUIRED.** The destructive-target and cleanup design is generally
careful, and the timer matches the brief, but the checksum bypass and absent
count baseline undermine two central restore-integrity guarantees.

## P1 follow-up fixes

### RED

- Added a checksum probe whose valid SHA-256 line names
  `overtime-20260720T000000ZXdump`. The restore test exited 1 with
  `restore drill unexpectedly accepted a non-literal checksum filename`,
  reproducing the regex interpolation bypass.
- Required `users_count=2` and `overtime_records_count=3` in backup metadata;
  the backup contract exited 1 because the producer did not emit them.
- Added restore cases for missing/non-matching count baselines and a failing
  `dropdb`. These require missing counts to fail before `createdb`, mismatches to
  fail with cleanup, and cleanup failure itself to keep the process nonzero
  without ever targeting `overtime`.

### GREEN

- The checksum line is parsed into hash, filename, and extra fields. The hash is
  shape-checked, the parsed filename is compared literally with the metadata
  archive basename, and extra fields are rejected before `sha256sum -c`.
- The backup producer obtains read-only users/records counts immediately before
  and after `pg_dump`. It aborts publication if they differ and records the
  stable values in the final metadata commit marker. A code comment documents
  that these boundary reads are not a shared snapshot and therefore use
  fail-closed count-change detection.
- Restore metadata must contain exactly one numeric value for both count fields;
  environment count overrides were removed. Restored counts must equal the
  committed baseline on every scheduled run.
- The cleanup trap preserves a nonzero status when `dropdb --if-exists` fails;
  the new fake-Docker case proves the failure is surfaced and only the validated
  temporary target is attempted.

### P1 verification

Fresh verification after the fixes:

```text
bash -n docker/postgres-backup.sh docker/postgres-backup-oci.sh docker/postgres-restore-drill.sh docker/backup-restore.test.sh docker/postgres-restore-drill.test.sh deploy/oracle/systemd-units.test.sh
bash docker/backup-restore.test.sh
# PostgreSQL backup and OCI upload contract passed
bash docker/postgres-restore-drill.test.sh
# PostgreSQL restore drill safety contract passed
bash deploy/oracle/systemd-units.test.sh
# oracle PostgreSQL backup and restore drill systemd unit contract passed
git diff --check
```
