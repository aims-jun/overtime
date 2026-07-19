# SQLite to PostgreSQL Migration Design

## Goal

Move the live AIMS overtime service from SQLite to a self-hosted PostgreSQL
database on the existing Oracle Cloud VM. Preserve every user and overtime
record, intentionally invalidate existing login sessions, keep the planned
maintenance window within 10 minutes, and add off-server backups that are
actually restore-tested.

The primary goals are to learn a production-style PostgreSQL workflow and to
improve recoverability. PostgreSQL on the same VM does not by itself provide
high availability, so the design treats external backups as a required part of
the migration rather than a later enhancement.

## Current Context

- The NestJS API uses TypeORM with `better-sqlite3` and a SQLite-specific
  migration.
- Production data is stored at `/data/overtime/overtime.sqlite` through a bind
  mount.
- At discovery time the live database contained three users, three sessions,
  and six overtime records. Migration preflight must obtain fresh counts rather
  than relying on these numbers.
- The VM has 952 MiB RAM, 2 GiB swap, and approximately 40 GiB free disk.
- The API currently uses about 114 MiB RAM and Caddy about 14 MiB RAM.
- The service has three expected users and can tolerate a planned outage of up
  to 10 minutes.

## Decisions

- Run PostgreSQL on the same Oracle VM as a private Docker Compose service.
- Use PostgreSQL 17 on Debian Bookworm. PostgreSQL 17 is supported through
  November 2029, and the current official image provides the
  `17.10-bookworm` tag.
- Never publish port 5432 on the host. Only the API and approved maintenance
  commands may reach PostgreSQL over the Compose network.
- Persist PostgreSQL outside the container at `/data/postgres`, mounted at
  `/var/lib/postgresql/data` as required for PostgreSQL 17 and older official
  images.
- Use a purpose-built migration program instead of `pgloader` or dual writes.
- Copy users and overtime records. Do not copy sessions; all users log in again.
- Back up every six hours to a private Oracle Object Storage bucket and retain
  remote backups for 30 days.
- Retain the final SQLite snapshot for at least 30 days after cutover.

References:

- PostgreSQL version policy: <https://www.postgresql.org/support/versioning/>
- Docker Official Image: <https://hub.docker.com/_/postgres>

## Runtime Architecture

`compose.production.yaml` gains a `postgres` service based on the pinned
PostgreSQL 17 Bookworm image. The service has a health check using `pg_isready`,
uses `restart: unless-stopped`, and does not declare host ports. The API starts
only after PostgreSQL is healthy.

The database bind mount is:

```text
host:      /data/postgres
container: /var/lib/postgresql/data
```

The API receives a runtime `DATABASE_URL` through the existing mode-0600
production environment file. An explicit migration command receives a separate
`DATABASE_MIGRATION_URL`. The runtime role can read and write application data
but cannot create or drop schemas; the migration role owns the application
schema but is not a PostgreSQL superuser. Production API startup never runs
schema migrations implicitly. PostgreSQL credentials must never appear in
Compose source, Git, logs, command output, or documentation examples with real
values. Secrets are generated on the VM. Both connections stay inside the
Docker network.

The 1 GiB VM requires conservative PostgreSQL limits. The initial operating
profile uses at most 20 connections, a 64 MiB shared buffer target, small
per-query work memory, and an explicit container memory limit. The exact
values are verified under the live API workload before cutover. Swap is a last
resort, not normal PostgreSQL working memory.

Local development and database integration tests move to PostgreSQL so that
production and test SQL behavior match. Unit tests that do not need a database
remain isolated. SQLite stays only as the migration source and rollback
artifact; it is no longer an application runtime after successful cutover.

## Schema and TypeORM

TypeORM configuration changes from `DATABASE_PATH` and `better-sqlite3` to a
validated `DATABASE_URL` and the `pg` driver. `synchronize` and automatic
production `migrationsRun` remain disabled. Migrations are mandatory and run as
an explicit, separately authenticated deployment step.

The PostgreSQL schema uses conventional snake_case database identifiers while
TypeScript entity properties retain their current camelCase API:

- UUID identifiers use PostgreSQL `uuid`.
- Instants use `timestamptz` and are normalized to UTC.
- `work_date` uses PostgreSQL `date`.
- Durations use `integer` with a positive-value check constraint.
- Reasons, names, Google subjects, emails, and token hashes use `text`.
- Existing unique indexes and foreign-key deletion behavior are preserved.
- Existing query patterns receive equivalent indexes.

The initial PostgreSQL migration creates the schema from an empty database. No
SQLite-specific `datetime('now')` expression or SQLite catalog query remains in
PostgreSQL migration or E2E coverage.

## Data Migration and Cutover

The migration program is a one-shot command with explicit source and target
arguments. It opens the SQLite source read-only and performs all PostgreSQL
inserts in one transaction.

Cutover sequence:

1. Announce the maintenance window and confirm PostgreSQL health.
2. Stop the API so no further SQLite writes can occur.
3. Create a SQLite `.backup`, run `PRAGMA integrity_check`, record its SHA-256,
   and save fresh table counts.
4. Run the PostgreSQL schema migration against an empty target database.
5. Validate that every source ID is a UUID and every date can be normalized.
6. Copy users first, then overtime records. Do not copy sessions.
7. Compare source and target inside the transaction:
   - exact user and overtime-record ID sets;
   - row counts;
   - foreign-key relationships;
   - deterministic hashes of sorted, normalized business fields;
   - duration totals by user and work date.
8. Commit only if every comparison passes. Otherwise roll back the transaction.
9. Start the API with PostgreSQL configuration and run health and smoke checks.
10. Reopen the service only after login, existing personal records, admin
    reports, and CSV have been checked. Do not create or delete synthetic
    records in production. The first legitimate employee write after cutover is
    monitored through API status and logs without altering its business value.

The migration refuses to run if the target contains business data unless a
separate, explicit test-only override is supplied. Re-running cannot silently
duplicate or overwrite production rows.

## Rollback Boundary

Before the service is reopened, a failed cutover rolls back by stopping the new
API and starting the last verified SQLite image and environment against the
unchanged SQLite file. PostgreSQL data may be discarded only after confirming
that the service never reopened and accepted PostgreSQL writes.

After the service is reopened, PostgreSQL is the sole source of truth. A simple
rollback to the stale SQLite snapshot is prohibited because it would lose new
PostgreSQL writes. Post-cutover incidents are handled by repairing PostgreSQL or
restoring a PostgreSQL backup. Any reverse migration requires a separate plan
and explicit approval.

The final SQLite snapshot and its checksum remain read-only for at least 30
days. The original live SQLite file is never deleted as part of cutover.

## Backup and Restore

A systemd timer runs at 00:00, 06:00, 12:00, and 18:00 Asia/Seoul. Each run:

1. Creates a PostgreSQL custom-format archive with `pg_dump`.
2. Validates that the archive is readable with `pg_restore --list`.
3. Writes a SHA-256 checksum and metadata containing the database version and
   UTC timestamp.
4. Uploads only validated artifacts to a private Object Storage bucket using an
   OCI instance principal.
5. Records success or failure in the systemd journal.
6. Keeps local backup artifacts for two days.

The Object Storage lifecycle policy deletes backups after 30 days. The dynamic
group and IAM policy are limited to the one VM and the one backup bucket. The
bucket is never public.

Once per week, a separate timer restores the newest archive into a temporary
database, checks schema migrations, table counts, foreign keys, and basic
queries, then drops only that temporary database. It never points restoration
commands at the production database. A documented manual recovery procedure
requires an explicit target database and confirmation before destructive
restore operations.

## Failure Handling

- PostgreSQL unhealthy: keep the API stopped and retain SQLite as the active
  rollback source during the maintenance window.
- SQLite integrity failure: abort before creating or changing target business
  data.
- Invalid source UUID or timestamp: report the row ID and abort the transaction
  without logging personal field values.
- Count, hash, aggregate, or foreign-key mismatch: roll back all imported rows.
- API health or smoke-test failure: do not reopen the service; roll back to
  SQLite while the no-new-writes condition still holds.
- Backup validation or upload failure: keep the last valid backup, exit nonzero,
  and leave a clear journal entry. Never delete a prior valid backup because a
  new run failed.
- Weekly restore-test failure: preserve production, report failure, and block
  any claim that backups are healthy until a restore passes.

## Verification

Automated verification includes:

- environment-schema tests for PostgreSQL URLs and missing secrets;
- TypeORM migration tests against a real PostgreSQL test container;
- repository and API E2E tests against PostgreSQL;
- migration tests with representative users, records, dates, Unicode reasons,
  nullable profile images, and deliberate invalid input;
- red-green tests proving sessions are excluded;
- idempotency and non-empty-target refusal tests;
- Compose contract tests proving 5432 is not published, the data path is
  persistent, PostgreSQL health gates API startup, and memory limits exist;
- backup creation, archive inspection, upload-call, retention, and temporary
  restore smoke tests;
- shell syntax and systemd unit contract tests.

Production verification records fresh evidence for PostgreSQL health, API
health, database version, migrated row counts and hashes, HTTPS, Google login,
existing employee record reads, admin reports, CSV export, backup upload, and a
successful temporary restore. CRUD behavior is proven in the isolated E2E
database, not by inserting and deleting synthetic production rows.

## Out of Scope

- High availability, replication, read replicas, and automatic failover.
- Exposing PostgreSQL to the public internet.
- A database administration web UI.
- Dual writes between SQLite and PostgreSQL.
- Preserving existing login sessions.
- Reverse synchronization from PostgreSQL back to SQLite after reopening.
- Changing product behavior or user-facing UI.
