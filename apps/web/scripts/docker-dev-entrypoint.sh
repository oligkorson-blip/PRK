#!/bin/sh
# Entrypoint for docker-compose.dev.yml — install deps once, migrate, seed, next dev.
set -eu

mkdir -p "$DOCUMENTS_DIR"

if [ ! -d node_modules/next ]; then
  echo "Installing npm dependencies (first run)…"
  npm ci --legacy-peer-deps
fi

echo "Applying migrations…"
npm run db:migrate

echo "Seeding demo catalogue…"
npm run db:seed

echo "Starting Next.js on 0.0.0.0:3000…"
exec npm run dev -- -H 0.0.0.0 -p 3000
