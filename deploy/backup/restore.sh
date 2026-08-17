#!/bin/bash
# Restore a Lunch Match backup into the database this container points at.
#
#   docker exec -it lunchmatch-backup \
#     restore.sh /backup/primary/lunchmatch-20260814T030000Z.sql.gz
#
# Destructive by design: the dumps are written with --clean --if-exists, so
# loading one drops the existing objects before recreating them. Requires an
# explicit CONFIRM=yes to make that hard to do by accident.
set -euo pipefail

ARCHIVE="${1:-}"

: "${PGHOST:?PGHOST must be set}"
: "${PGUSER:?PGUSER must be set}"
: "${PGPASSWORD:?PGPASSWORD must be set}"
: "${PGDATABASE:?PGDATABASE must be set}"

if [[ -z "${ARCHIVE}" ]]; then
  echo "usage: restore.sh <path-to-backup.sql.gz>" >&2
  echo >&2
  echo "available backups:" >&2
  ls -1t /backup/primary/lunchmatch-*.sql.gz 2>/dev/null | head -20 >&2 || echo "  (none)" >&2
  exit 2
fi

if [[ ! -f "${ARCHIVE}" ]]; then
  echo "no such file: ${ARCHIVE}" >&2
  exit 2
fi

# Check the archive before touching the database, so a corrupt file fails
# safely rather than half-way through dropping the schema.
if ! gzip -t "${ARCHIVE}"; then
  echo "archive failed its integrity check, refusing to restore: ${ARCHIVE}" >&2
  exit 1
fi

if [[ "${CONFIRM:-}" != "yes" ]]; then
  echo "About to OVERWRITE database '${PGDATABASE}' on ${PGHOST} with:" >&2
  echo "  ${ARCHIVE}" >&2
  echo >&2
  echo "All current data in that database will be lost. Re-run with CONFIRM=yes" >&2
  echo "if that is what you want:" >&2
  echo "  CONFIRM=yes restore.sh ${ARCHIVE}" >&2
  exit 3
fi

echo "==> Stop the web container first if it is running, so nothing writes mid-restore."
echo "==> Restoring ${ARCHIVE} into ${PGDATABASE}"

# ON_ERROR_STOP so a failure aborts instead of ploughing on and leaving a
# half-restored database. The DROP statements from --clean are expected to
# report harmless notices on a fresh database; --if-exists keeps them quiet.
gunzip -c "${ARCHIVE}" | psql --set ON_ERROR_STOP=on --quiet

echo "==> Restore complete. Start the web container again."
