#!/usr/bin/env bash
# Restore a backup produced by scripts/backup.sh into the running compose stack.
#
# Usage: ./scripts/restore.sh <backup-dir>
#
# DESTRUCTIVE: drops and recreates the Postgres 'public' schema, then loads the
# dump, then overwrites the documents volume. A pre-restore safety dump of the
# current database is written to $BACKUP_DIR/pre-restore-<timestamp>/ first.
# Requires typing RESTORE to confirm (or RESTORE_CONFIRM=RESTORE in the env).
set -euo pipefail

SRC=${1:-}
if [ -z "$SRC" ] || [ ! -d "$SRC" ]; then
  echo "Usage: $0 <backup-dir>  (a directory produced by scripts/backup.sh)" >&2
  exit 1
fi

# Locate the dump: encrypted, gzipped, or plain (legacy backups).
if [ -f "$SRC/db.sql.gz.gpg" ]; then
  DECRYPT=gpg
elif [ -f "$SRC/db.sql.gz" ]; then
  DECRYPT=gunzip
elif [ -f "$SRC/db.sql" ]; then
  DECRYPT=cat
else
  echo "No database dump in $SRC (expected db.sql.gz.gpg, db.sql.gz, or db.sql)" >&2
  exit 1
fi

echo "*** DESTRUCTIVE OPERATION ***"
echo "This replaces the current database of the compose 'postgres' service with"
echo "the dump from: $SRC"
if [ -d "$SRC/documents" ]; then
  echo "It also overwrites the documents volume from: $SRC/documents"
fi
echo "A pre-restore safety dump of the current database is taken first."
echo "Tip: run 'docker compose stop web' first so the app holds no DB connections."
if [ "${RESTORE_CONFIRM:-}" != "RESTORE" ]; then
  read -r -p "Type RESTORE to continue: " REPLY
  if [ "$REPLY" != "RESTORE" ]; then
    echo "Aborted."
    exit 1
  fi
fi

# Pre-restore safety dump of whatever is currently in the database.
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
SAFETY=${BACKUP_DIR:-./backups}/pre-restore-$STAMP
mkdir -p "$SAFETY"
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gzip > "$SAFETY/db.sql.gz"
echo "Pre-restore safety dump written to $SAFETY/db.sql.gz"

echo "Resetting public schema..."
docker compose exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'

echo "Restoring database..."
case "$DECRYPT" in
  gpg)    gpg --batch --decrypt "$SRC/db.sql.gz.gpg" ;;
  gunzip) gunzip -c "$SRC/db.sql.gz" ;;
  cat)    cat "$SRC/db.sql" ;;
esac | docker compose exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q'

if [ -d "$SRC/documents" ]; then
  echo "Restoring documents volume..."
  docker compose cp "$SRC/documents/." web:/data/documents
fi

echo "Restore complete. Pre-restore safety dump kept at $SAFETY"
echo "Restart the app if you stopped it: docker compose start web"
