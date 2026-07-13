# Overtime Tracker Design

## 1. Purpose

Overtime Tracker is a mobile-first internal web service for recording and reviewing employee overtime. Employees sign in with a company Google Workspace account and manage only their own records. Administrators can review company-wide monthly records and export the filtered result as CSV.

The first release targets one company and one team. Approval workflows, payroll calculation, multiple teams, and administrator-managed roles are outside the first-release scope.

## 2. Success Criteria

The first release is successful when:

- An employee can sign in with an allowed company Google account on a mobile browser.
- An employee can create, view, edit, and delete their own overtime records.
- Overtime that ends after midnight is calculated correctly in the `Asia/Seoul` time zone.
- An administrator can filter records by month and employee, view totals, and download the same result as CSV.
- Unauthorized users cannot access another employee's records or administrator APIs.
- The application can run locally with Docker and is packaged for deployment to one GCP Compute Engine VM.
- A deployment runbook explains the final domain, HTTPS, Google configuration, backup, and restore steps.

Production Google sign-in and public deployment remain pending until a domain or authorized company subdomain is available. Local Google sign-in uses Google's permitted `localhost` development configuration.

## 3. Scope

### Included

- Responsive React web application
- NestJS REST API
- Google Identity Services sign-in
- Company Google hosted-domain restriction
- Opaque server-side sessions in secure cookies
- Employee overtime CRUD
- Administrator monthly filtering and totals
- CSV export of the active administrator filter
- SQLite persistence on a GCP Persistent Disk
- Docker-based local and production packaging
- Health endpoint, structured logs, database backup, and restore documentation

### Excluded

- Approval or rejection workflow
- Payroll and monetary calculations
- Multiple companies or teams
- Native mobile applications or PWA installation
- Administrator UI for assigning roles
- Email, chat, or push notifications
- Charts and advanced analytics
- Horizontal scaling or multiple API instances

## 4. Architecture

The project is a monorepo:

```text
overtime-tracker/
├── apps/
│   ├── web/                 # React, TypeScript, Vite
│   └── api/                 # NestJS
├── docker/
├── docs/
├── compose.yaml             # Local development
├── compose.production.yaml  # Single-VM deployment
└── README.md
```

The NestJS application is divided by responsibility:

- `AuthModule`: Google credential verification, hosted-domain checks, session lifecycle
- `UsersModule`: persisted Google user profile and user lookup
- `OvertimeModule`: employee record commands, queries, validation, and ownership rules
- `ReportsModule`: administrator filters, monthly totals, and CSV generation
- `HealthModule`: process and database readiness checks

The API uses controllers for HTTP translation, application services for business rules, and repositories for persistence. Repositories isolate the ORM and SQLite-specific details so that a later PostgreSQL migration does not change controllers or business rules.

TypeORM is the persistence tool for the first release, using the `better-sqlite3` driver. It integrates with NestJS dependency injection, supports explicit migrations, and can target PostgreSQL later. Application services depend on project-owned repository interfaces rather than TypeORM repositories directly. A PostgreSQL move still requires new database migrations and a data-transfer operation; it is not treated as a configuration-only switch.

In production, two containers run on one Compute Engine VM:

```text
Internet
   |
   v
Caddy web container
   ├── /       -> React static assets
   └── /api/*  -> NestJS API container
                         |
                         v
               /data/overtime/overtime.sqlite
                 on a Persistent Disk
```

The web and API share one origin. This avoids cross-origin cookie configuration and keeps the deployment small enough for an `e2-micro` VM. SQLite is embedded in the API process and does not run in a separate container.

## 5. Authentication and Authorization

React renders the official Google Identity Services sign-in control. It submits the returned Google ID credential to `POST /api/auth/google`. The API verifies the credential with Google's supported verification library and checks:

- Google signature
- `aud` against the configured client ID
- `iss`
- expiration
- verified email state
- `hd` against `GOOGLE_HOSTED_DOMAIN`

The Google `sub` claim is the stable external user identifier. Email is retained for display and administrator configuration but is not the primary identity key.

After verification, the API upserts the user and issues a cryptographically random opaque session token. Only a hash of that token is stored in the `sessions` table. The raw token is placed in a cookie configured as `HttpOnly`, `Secure` in production, and `SameSite=Lax`. Sessions expire after seven days and logout revokes the current session.

State-changing requests must originate from the configured application origin. The API validates the `Origin` header in addition to the same-site cookie policy. Google credential submission follows Google's CSRF protections.

Administrator access is configured through a comma-separated `ADMIN_EMAILS` environment variable. This configuration is the source of truth; administrator guards compare the current verified user email with the configured allowlist. No role-editing UI is included.

Authorization rules are:

- Any authenticated employee can read, create, update, and delete only their records.
- An administrator can read all records, totals, and CSV reports.
- Administrator status does not grant record mutation for other employees.
- Unauthenticated requests receive `401`; authenticated but unauthorized requests receive `403`.

## 6. Data Model

### User

| Field | Meaning |
|---|---|
| `id` | Internal UUID |
| `googleSubject` | Unique Google `sub` claim |
| `email` | Current verified company email |
| `name` | Display name |
| `profileImageUrl` | Optional Google profile image |
| `createdAt` | First sign-in time |
| `lastLoginAt` | Most recent successful sign-in |

### Session

| Field | Meaning |
|---|---|
| `id` | Internal UUID |
| `tokenHash` | Unique hash of the opaque cookie value |
| `userId` | Owning user |
| `expiresAt` | Absolute expiry time |
| `createdAt` | Creation time |

Expired sessions may be removed during login and by a scheduled maintenance command. Authorization always loads the current user so administrator configuration changes are reflected without embedding a role in a long-lived client token.

### OvertimeRecord

| Field | Meaning |
|---|---|
| `id` | Internal UUID |
| `userId` | Owning employee |
| `workDate` | Korean calendar date on which overtime starts |
| `startAt` | Absolute start timestamp |
| `endAt` | Absolute end timestamp |
| `durationMinutes` | Server-calculated duration |
| `reason` | Trimmed employee explanation, 1-500 characters |
| `createdAt` | Creation time |
| `updatedAt` | Last update time |

The API accepts a Korean work date plus local start and end times. If the end time is earlier than the start time, it is interpreted as the following day. Equal start and end times are invalid. Duration must be greater than zero and no more than 16 hours.

Employees may create multiple records for one work date, but records belonging to the same employee cannot overlap. All validation and duration calculation occur on the server and run again on updates. Monthly reports group records by `workDate`, not the UTC date of `startAt`.

## 7. API Contract

### Authentication

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/auth/google` | Verify Google credential and create session |
| `POST` | `/api/auth/logout` | Revoke current session and clear cookie |
| `GET` | `/api/auth/me` | Return the current user and derived administrator status |

### Employee Records

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/overtime?month=YYYY-MM` | List the current employee's records and monthly total |
| `POST` | `/api/overtime` | Create a record |
| `PATCH` | `/api/overtime/:id` | Update the employee's record |
| `DELETE` | `/api/overtime/:id` | Delete the employee's record |

### Administrator Reporting

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/admin/users` | List employees for the filter control |
| `GET` | `/api/admin/overtime?month=YYYY-MM&userId=UUID` | List filtered records and totals |
| `GET` | `/api/admin/reports/monthly.csv?month=YYYY-MM&userId=UUID` | Download the identical filtered result as UTF-8 CSV |

The `userId` filter is optional and an omitted value means all users. CSV uses a UTF-8 BOM for compatibility with common Korean spreadsheet applications and contains work date, employee name, employee email, start, end, duration, and reason. CSV cells are escaped to prevent spreadsheet formula injection.

### Operations

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/health` | Report process and SQLite readiness without exposing secrets |

## 8. User Experience

The employee flow is optimized for mobile browsers:

1. Sign in with a company Google account.
2. See the current month's total and record list.
3. Open the add form.
4. Enter work date, start time, end time, and reason.
5. Review the calculated duration preview and save.
6. Edit or delete an owned record from the list.

The server remains authoritative for duration even though the web UI shows a preview. The form keeps entered values after recoverable network or validation failures.

The administrator view provides a month selector, optional employee selector, total duration, record table, and CSV download. It remains responsive but prioritizes tabular use on larger screens.

Required states include initial loading, empty month, inline validation errors, expired session, forbidden company account, network failure with retry, and unexpected server failure.

## 9. Error Handling and Logging

The API returns a consistent error body containing a stable application code, a safe user message, and an optional field-error map. Expected mappings include:

- `400`: malformed query or input
- `401`: missing, invalid, or expired session
- `403`: wrong Google hosted domain or insufficient role
- `404`: record absent or not owned by the employee
- `409`: overlapping overtime record
- `500`: unexpected server failure with internal details omitted

NestJS validation pipes reject unknown input fields. A global exception filter converts expected domain errors into the common response format and logs unexpected failures with a request ID. Logs contain route, status, duration, and request ID but never Google credentials, session cookies, full CSV content, or sensitive environment variables.

## 10. Testing Strategy

### Unit Tests

- Korean local-time conversion and midnight rollover
- Zero, negative, and over-16-hour rejection
- Overlap detection, including records crossing midnight
- Server-side duration calculation
- Administrator email allowlist evaluation
- CSV escaping and formula-injection prevention

### API Integration Tests

- Employee CRUD happy paths
- Ownership protection against read-by-ID mutation attempts
- General employee rejection from administrator routes
- Administrator filter and total calculations
- Google hosted-domain and token-claim validation boundaries using a mocked verifier
- Session creation, expiry, logout, and revocation
- Database constraint behavior

### Web Tests

- Mobile record creation and validation flow
- Input preservation after an API failure
- Empty, loading, and session-expired states
- Administrator filter synchronization with CSV download

### Deployment Verification

- Container health checks
- Persistent database survives API container replacement
- Database migration runs once before application startup
- Backup can be restored into a clean environment

## 11. Deployment, Persistence, and Backup

The target is one non-preemptible GCP Compute Engine `e2-micro` VM in an eligible free-tier US region with standard Persistent Disk. Free-tier limits are not a cost guarantee; billing and budget alerts must be configured before deployment.

Production images use multi-stage Docker builds so TypeScript and React build dependencies are absent from runtime images. A CI workflow builds versioned images and pushes them to GCP Artifact Registry; the VM's service account receives pull-only access. The VM pulls prebuilt images rather than compiling the project under its limited memory. Registry storage and build usage are included in cost monitoring because they are not assumed to be free. Containers run as non-root users, use health checks, have restart policies, and cap log-file size.

The SQLite database is bind-mounted from `/data/overtime` on a Persistent Disk. It is never stored only in a container layer, committed to Git, or embedded in an image. VM and disk deletion policies must preserve the data disk when the VM is replaced.

A scheduled job creates a transactionally consistent SQLite backup using SQLite's supported backup mechanism and uploads it to a private Cloud Storage bucket. Retention and lifecycle rules keep a bounded number of backups. The runbook includes a restore drill. Disk persistence alone is not treated as a backup.

Until a domain is available, deployment assets and documentation can be completed but public Google sign-in cannot be considered production-ready. Final activation requires:

- A domain or authorized company subdomain
- DNS pointed to the VM
- Caddy-issued HTTPS certificate
- Exact production origin registered with Google
- OAuth application configured for the company organization where available

## 12. Implementation Sequence

1. Create the monorepo and Docker development environment.
2. Establish NestJS modules, configuration validation, SQLite schema, and migrations.
3. Implement overtime domain rules and employee APIs with tests.
4. Implement the mobile employee web flow.
5. Add Google verification, opaque sessions, origin checks, and authorization guards.
6. Add administrator filters, totals, and safe CSV export.
7. Add production Docker images, Caddy routing, health checks, logging, backup, and restore tooling.
8. Verify local production-style deployment.
9. Provision the GCP VM and Persistent Disk and configure budget alerts.
10. When a domain is available, configure DNS, HTTPS, Google production origin, and complete the live deployment verification.

## 13. References

- [Google: Verify the Google ID token on your server side](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
- [Google: OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [Google: OAuth 2.0 Policies](https://developers.google.com/identity/protocols/oauth2/policies)
- [NestJS: Authentication](https://docs.nestjs.com/security/authentication)
- [NestJS: Authorization](https://docs.nestjs.com/security/authorization)
- [Google Cloud Free Tier](https://docs.cloud.google.com/free/docs/free-cloud-features)
- [Google Cloud Persistent Disk](https://docs.cloud.google.com/compute/docs/disks/persistent-disks)
- [Google Cloud Data Protection](https://docs.cloud.google.com/compute/docs/disks/data-protection)
- [SQLite: Appropriate Uses](https://www.sqlite.org/whentouse.html)
