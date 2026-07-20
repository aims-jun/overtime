#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
service="$root/deploy/oracle/overtime-backup.service"
timer="$root/deploy/oracle/overtime-backup.timer"
drill_service="$root/deploy/oracle/overtime-restore-drill.service"
drill_timer="$root/deploy/oracle/overtime-restore-drill.timer"

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

grep -Fx 'Type=oneshot' "$drill_service"
grep -Fx 'User=root' "$drill_service"
grep -Fx 'EnvironmentFile=/opt/overtime/.env.backup' "$drill_service"
grep -Fx "ExecStartPre=/bin/sh -c 'test \"\$(stat -c %%a /opt/overtime/.env.backup)\" = 600'" "$drill_service"
grep -Fx 'ExecStart=/opt/overtime/docker/postgres-restore-drill.sh' "$drill_service"
grep -Fx 'UMask=0077' "$drill_service"
grep -Fx 'OnCalendar=Sun *-*-* 04:30:00 Asia/Seoul' "$drill_timer"
grep -Fx 'Persistent=true' "$drill_timer"
grep -Fx 'RandomizedDelaySec=10m' "$drill_timer"
grep -Fx 'WantedBy=timers.target' "$drill_timer"

echo 'oracle PostgreSQL backup and restore drill systemd unit contract passed'
