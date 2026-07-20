#!/usr/bin/env bash
set -euo pipefail

database="${POSTGRES_DB:-overtime}"
admin_user="${POSTGRES_USER:-postgres}"

ready="$(psql \
  --set=ON_ERROR_STOP=1 \
  --username "$admin_user" \
  --dbname "$database" \
  --tuples-only \
  --no-align <<'SQL'
WITH role_ids AS (
  SELECT
    (SELECT oid FROM pg_roles WHERE rolname = 'overtime_migrator') AS migrator,
    (SELECT oid FROM pg_roles WHERE rolname = 'overtime_app') AS app,
    (SELECT oid FROM pg_roles WHERE rolname = 'overtime_backup') AS backup
),
schema_ids AS (
  SELECT oid AS public_schema
  FROM pg_namespace
  WHERE nspname = 'public'
),
role_state AS (
  SELECT count(*) = 3 AS valid
  FROM pg_roles
  WHERE rolname IN ('overtime_migrator', 'overtime_app', 'overtime_backup')
    AND rolcanlogin
    AND NOT rolsuper
    AND NOT rolcreatedb
    AND NOT rolcreaterole
),
default_table_privileges AS (
  SELECT
    grantee.rolname,
    count(*) FILTER (
      WHERE acl.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    ) AS dml_count,
    count(*) AS total_count
  FROM pg_default_acl AS defaults
  CROSS JOIN LATERAL aclexplode(defaults.defaclacl) AS acl
  JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
  CROSS JOIN role_ids
  CROSS JOIN schema_ids
  WHERE defaults.defaclrole = role_ids.migrator
    AND defaults.defaclnamespace = schema_ids.public_schema
    AND defaults.defaclobjtype = 'r'
    AND grantee.rolname IN ('overtime_app', 'overtime_backup')
  GROUP BY grantee.rolname
),
default_sequence_privileges AS (
  SELECT
    grantee.rolname,
    count(*) FILTER (WHERE acl.privilege_type = 'SELECT') AS select_count,
    count(*) AS total_count
  FROM pg_default_acl AS defaults
  CROSS JOIN LATERAL aclexplode(defaults.defaclacl) AS acl
  JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
  CROSS JOIN role_ids
  CROSS JOIN schema_ids
  WHERE defaults.defaclrole = role_ids.migrator
    AND defaults.defaclnamespace = schema_ids.public_schema
    AND defaults.defaclobjtype = 'S'
    AND grantee.rolname IN ('overtime_app', 'overtime_backup')
  GROUP BY grantee.rolname
)
SELECT
  role_state.valid
  AND pg_get_userbyid(database_state.datdba) = 'overtime_migrator'
  AND pg_get_userbyid(schema_state.nspowner) = 'overtime_migrator'
  AND coalesce(has_database_privilege(role_ids.app, database_state.oid, 'CONNECT'), false)
  AND coalesce(has_database_privilege(role_ids.backup, database_state.oid, 'CONNECT'), false)
  AND coalesce(has_schema_privilege(role_ids.app, schema_ids.public_schema, 'USAGE'), false)
  AND coalesce(has_schema_privilege(role_ids.backup, schema_ids.public_schema, 'USAGE'), false)
  AND NOT coalesce(has_schema_privilege(role_ids.app, schema_ids.public_schema, 'CREATE'), false)
  AND NOT coalesce(has_schema_privilege(role_ids.backup, schema_ids.public_schema, 'CREATE'), false)
  AND EXISTS (
    SELECT 1
    FROM default_table_privileges
    WHERE rolname = 'overtime_app' AND dml_count = 4 AND total_count = 4
  )
  AND EXISTS (
    SELECT 1
    FROM default_table_privileges
    WHERE rolname = 'overtime_backup' AND dml_count = 1 AND total_count = 1
  )
  AND EXISTS (
    SELECT 1
    FROM default_sequence_privileges
    WHERE rolname = 'overtime_backup' AND select_count = 1 AND total_count = 1
  )
  AND NOT EXISTS (
    SELECT 1
    FROM default_sequence_privileges
    WHERE rolname = 'overtime_app'
  )
FROM role_ids
CROSS JOIN schema_ids
CROSS JOIN role_state
JOIN pg_database AS database_state ON database_state.datname = current_database()
JOIN pg_namespace AS schema_state ON schema_state.oid = schema_ids.public_schema;
SQL
)"

[[ "$ready" == "t" ]]
