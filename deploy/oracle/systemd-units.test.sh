#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
service="$root/deploy/oracle/overtime-backup.service"
timer="$root/deploy/oracle/overtime-backup.timer"

grep -Fx 'Type=oneshot' "$service"
grep -Fx 'User=root' "$service"
grep -Fx 'EnvironmentFile=/opt/overtime/.env.backup' "$service"
grep -Fx "ExecStartPre=/bin/sh -c 'test \"\$(stat -c %%a /opt/overtime/.env.backup)\" = 600'" "$service"
grep -Fx 'ExecStart=/opt/overtime/docker/postgres-backup-oci.sh' "$service"
grep -Fx 'UMask=0077' "$service"
grep -Fx 'OnCalendar=*-*-* 00,06,12,18:00:00 Asia/Seoul' "$timer"
grep -Fx 'Persistent=true' "$timer"
grep -Fx 'RandomizedDelaySec=5m' "$timer"
grep -Fx 'WantedBy=timers.target' "$timer"

echo 'oracle PostgreSQL backup systemd unit contract passed'
