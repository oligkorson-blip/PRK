#!/bin/sh
# Production entrypoint: validate the environment, apply migrations, then start.
# Migrations are forward-only — roll back by restoring a backup (see docs/DEPLOY_NJALLA_COOLIFY.md).
set -eu

node scripts/validate-production-env.mjs

mkdir -p "$DOCUMENTS_DIR"
if [ ! -r "$DOCUMENTS_DIR" ] || [ ! -w "$DOCUMENTS_DIR" ]; then
  echo "DOCUMENTS_DIR is not readable and writable by the runtime user" >&2
  exit 1
fi

echo "Applying database migrations before accepting traffic..."
npm run db:migrate

echo "Migrations complete; starting Parkwise web service..."
# exec node directly (not npm) so node becomes PID 1 and handles SIGTERM cleanly
exec node node_modules/next/dist/bin/next start
