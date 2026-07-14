#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
service="$root/deploy/oracle/overtime-backup.service"
timer="$root/deploy/oracle/overtime-backup.timer"

grep -Fx 'User=overtime' "$service"
grep -Fx 'EnvironmentFile=/opt/overtime/.env.backup' "$service"
grep -Fx 'ExecStart=/opt/overtime/docker/backup-oci.sh' "$service"
grep -Fx 'OnCalendar=*-*-* 03:00:00 Asia/Seoul' "$timer"
grep -Fx 'Persistent=true' "$timer"
grep -Fx 'WantedBy=timers.target' "$timer"

echo 'oracle systemd unit contract passed'
