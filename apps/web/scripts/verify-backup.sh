#!/usr/bin/env bash
# Verifies a backup directory produced by scripts/backup.sh:
# presence of a DB dump (db.sql.gz.gpg / db.sql.gz / legacy db.sql),
# gzip integrity of the dump and the documents copy.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 /path/to/backups/TIMESTAMP" >&2
  exit 2
fi

BACKUP_PATH=$1
if [ ! -d "$BACKUP_PATH" ]; then
  echo "Backup directory does not exist: $BACKUP_PATH" >&2
  exit 1
fi

DUMP=""
for candidate in db.sql.gz.gpg db.sql.gz db.sql; do
  if [ -f "$BACKUP_PATH/$candidate" ]; then
    DUMP=$candidate
    break
  fi
done
if [ -z "$DUMP" ]; then
  echo "Missing DB dump (expected db.sql.gz.gpg, db.sql.gz, or db.sql) in $BACKUP_PATH" >&2
  exit 1
fi

# gzip integrity (encrypted dumps are gzip underneath, so gzip -t still applies after decryption;
# for the .gpg case we only verify the file is non-empty and gpg can list its packets)
case "$DUMP" in
  *.gz)
    gzip -t "$BACKUP_PATH/$DUMP"
    ;;
  *.gpg)
    if [ ! -s "$BACKUP_PATH/$DUMP" ]; then
      echo "Encrypted dump is empty: $DUMP" >&2
      exit 1
    fi
    gpg --batch --list-packets "$BACKUP_PATH/$DUMP" >/dev/null 2>&1 || {
      echo "Encrypted dump is not valid OpenPGP data: $DUMP" >&2
      exit 1
    }
    ;;
  *)
    if [ ! -s "$BACKUP_PATH/$DUMP" ]; then
      echo "Dump is empty: $DUMP" >&2
      exit 1
    fi
    ;;
esac

if [ -d "$BACKUP_PATH/documents" ]; then
  if [ -z "$(ls -A "$BACKUP_PATH/documents" 2>/dev/null)" ]; then
    echo "warning: documents copy exists but is empty" >&2
  fi
else
  echo "warning: no documents copy in $BACKUP_PATH" >&2
fi

echo "Backup integrity checks passed: $BACKUP_PATH ($DUMP)"
