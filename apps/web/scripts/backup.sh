#!/usr/bin/env bash
# Backup the compose stack: Postgres dump (gzipped, GPG-encrypted by default)
# plus a copy of the documents volume. Then prune old backups and optionally
# mirror the new backup to an offsite directory.
#
# Env knobs:
#   BACKUP_DIR             backup root (default ./backups)
#   BACKUP_RETENTION_DAYS  prune timestamped backup dirs older than this (default 14)
#   GPG_RECIPIENT          encrypt the dump to this key (db.sql.gz.gpg); the
#                          recipient's public key must be in the local keyring.
#                          Required unless ALLOW_PLAINTEXT_BACKUP=true.
#   ALLOW_PLAINTEXT_BACKUP set to "true" to allow an unencrypted db.sql.gz
#                          (loud warning; for local/dev use only)
#   BACKUP_OFFSITE_DIR     when set, rsync -a the new backup dir into this path
set -euo pipefail
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
ROOT=${BACKUP_DIR:-./backups}
OUT="$ROOT/$STAMP"
if [ -z "${GPG_RECIPIENT:-}" ] && [ "${ALLOW_PLAINTEXT_BACKUP:-}" != "true" ]; then
  echo "Refusing to write a plaintext database dump: set GPG_RECIPIENT to encrypt the dump," >&2
  echo "or set ALLOW_PLAINTEXT_BACKUP=true to explicitly opt in to unencrypted backups." >&2
  exit 1
fi
mkdir -p "$OUT"
# Run pg_dump inside the container so it uses the same POSTGRES_USER/POSTGRES_DB
# that compose resolved (from .env or the environment); host-side env may not have them.
if [ -n "${GPG_RECIPIENT:-}" ]; then
  # Encrypted dump: plaintext never touches disk. --trust-model always keeps
  # unattended (cron) runs from failing on key-trust prompts; only export the
  # public key to this host and keep the private key elsewhere.
  docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
    | gzip \
    | gpg --batch --yes --trust-model always --encrypt --recipient "$GPG_RECIPIENT" \
        --output "$OUT/db.sql.gz.gpg"
else
  echo "WARNING: ALLOW_PLAINTEXT_BACKUP=true — writing an UNENCRYPTED database dump to" >&2
  echo "$OUT/db.sql.gz (and rsyncing it offsite if BACKUP_OFFSITE_DIR is set)." >&2
  docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
    | gzip > "$OUT/db.sql.gz"
fi
docker compose cp web:/data/documents "$OUT/documents"

# Prune timestamped backup dirs (our naming scheme only) past the retention window.
RETENTION=${BACKUP_RETENTION_DAYS:-14}
find "$ROOT" -mindepth 1 -maxdepth 1 -type d -name '20??????T??????Z' \
  -mtime +"$RETENTION" -exec rm -rf {} +

# Optional offsite mirror (mounted storage, rclone mount, second host via sshfs...).
if [ -n "${BACKUP_OFFSITE_DIR:-}" ]; then
  rsync -a "$OUT" "${BACKUP_OFFSITE_DIR%/}/"
fi

echo "Backup written to $OUT"
