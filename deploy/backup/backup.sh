#!/bin/bash
# Periodic logical backup of the Lunch Match database onto USB storage.
#
# Runs as a long-lived sidecar rather than a host cron job so that the whole
# deployment stays described by the Portainer stack — nothing to configure on
# the Pi itself beyond mounting the drives.
set -euo pipefail

PRIMARY_DIR="${PRIMARY_DIR:-/backup/primary}"
MIRROR_DIR="${MIRROR_DIR:-/backup/mirror}"
INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"
PRIMARY_RETENTION_DAYS="${PRIMARY_RETENTION_DAYS:-30}"
MIRROR_RETENTION_DAYS="${MIRROR_RETENTION_DAYS:-180}"

# Marker file that must exist on each drive. See require_marker().
MARKER=".lunchmatch-backup-volume"

: "${PGHOST:?PGHOST must be set}"
: "${PGUSER:?PGUSER must be set}"
: "${PGPASSWORD:?PGPASSWORD must be set}"
: "${PGDATABASE:?PGDATABASE must be set}"

log() {
  echo "[backup] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"
}

# Docker creates a bind-mount source directory if it does not exist. So when a
# USB drive fails to mount, /mnt/backup-primary silently becomes an ordinary
# empty directory on the SD card, and backups keep "succeeding" while landing
# nowhere useful and slowly filling the boot medium. A marker file placed on
# the drive itself (not on the mount point) is the cheapest way to tell the two
# situations apart.
require_marker() {
  local dir="$1" label="$2"
  if [[ ! -f "${dir}/${MARKER}" ]]; then
    log "ERROR ${label} volume ${dir} has no ${MARKER} marker file."
    log "      The USB drive is most likely not mounted. Refusing to write so"
    log "      that backups cannot end up on the SD card unnoticed."
    return 1
  fi
  return 0
}

# Write to a hidden .partial name and rename only once the dump is complete and
# verified. Rename within a filesystem is atomic, so a crash or a pulled drive
# can leave a partial file but never a corrupt file under a real backup name.
run_backup() {
  local timestamp name tmp final
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  name="lunchmatch-${timestamp}.sql.gz"
  tmp="${PRIMARY_DIR}/.${name}.partial"
  final="${PRIMARY_DIR}/${name}"

  log "dumping ${PGDATABASE} from ${PGHOST} -> ${name}"

  # --clean --if-exists makes each dump self-contained: loading it drops the
  # existing objects first, so restore.sh is a plain psql invocation with no
  # separate "empty the schema" step to remember.
  # pipefail (set above) is what makes a pg_dump failure fail the pipeline —
  # without it gzip's exit status would mask it.
  if ! pg_dump --format=plain --no-owner --no-privileges --clean --if-exists \
      | gzip -9 > "${tmp}"; then
    log "ERROR pg_dump failed"
    rm -f "${tmp}"
    return 1
  fi

  # A truncated archive that still has a plausible size is worse than no backup
  # at all, because it looks like one until the day you need it.
  if ! gzip -t "${tmp}"; then
    log "ERROR dump failed gzip integrity check"
    rm -f "${tmp}"
    return 1
  fi

  mv "${tmp}" "${final}"
  log "wrote ${final} ($(du -h "${final}" | cut -f1))"

  mirror "${name}" "${final}"
  prune "${PRIMARY_DIR}" "${PRIMARY_RETENTION_DAYS}" "primary"
  return 0
}

# The second drive is a copy, not a second dump: one dump, two destinations,
# so the two drives can never disagree about what a given filename contains.
# A missing mirror is a warning, not a failure — a single-drive setup still
# produces backups.
mirror() {
  local name="$1" source="$2" tmp
  if ! require_marker "${MIRROR_DIR}" "mirror"; then
    log "WARN skipping mirror copy"
    return 0
  fi
  tmp="${MIRROR_DIR}/.${name}.partial"
  if cp "${source}" "${tmp}" && mv "${tmp}" "${MIRROR_DIR}/${name}"; then
    log "mirrored to ${MIRROR_DIR}/${name}"
    prune "${MIRROR_DIR}" "${MIRROR_RETENTION_DAYS}" "mirror"
  else
    log "ERROR mirror copy failed"
    rm -f "${tmp}"
  fi
  return 0
}

prune() {
  local dir="$1" days="$2" label="$3"
  # -mtime +N is "older than N days"; deletions are logged so the container log
  # is a complete history of what exists and what went away.
  find "${dir}" -maxdepth 1 -type f -name 'lunchmatch-*.sql.gz' \
    -mtime "+${days}" -print -delete | while read -r removed; do
    log "pruned ${label} ${removed}"
  done
  # Leftovers from an interrupted run; anything still .partial after a day is
  # never going to be completed.
  find "${dir}" -maxdepth 1 -type f -name '.*.partial' -mtime +1 -delete
}

log "starting"
log "  interval          ${INTERVAL_SECONDS}s"
log "  primary           ${PRIMARY_DIR} (keep ${PRIMARY_RETENTION_DAYS}d)"
log "  mirror            ${MIRROR_DIR} (keep ${MIRROR_RETENTION_DAYS}d)"

# Back up immediately on start, then on the interval. Restarting the stack
# therefore always produces a fresh backup, which is exactly when you want one.
while true; do
  if require_marker "${PRIMARY_DIR}" "primary"; then
    run_backup || log "ERROR backup run failed; will retry next interval"
  fi
  sleep "${INTERVAL_SECONDS}"
done
