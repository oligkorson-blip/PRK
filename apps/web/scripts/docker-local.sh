#!/usr/bin/env bash
# Start Parkwise for local viewing via Docker.
#
# Default: Postgres + Next.js (next dev) in Docker — no production image build.
#   ./scripts/docker-local.sh
#
# Postgres only in Docker; Next on the host (use when nested Docker / overlay mounts fail):
#   ./scripts/docker-local.sh --host-web
#
# Production-style image (slow; needs free RAM and free port 3000):
#   ./scripts/docker-local.sh --prod
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODE="dev"
for arg in "$@"; do
  case "$arg" in
    --host-web) MODE="host-web" ;;
    --prod) MODE="prod" ;;
    -h|--help)
      sed -n '2,14p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)" >&2
      exit 1
      ;;
  esac
done

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed or not on PATH." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not reachable. Start Docker Desktop (macOS/Windows) or dockerd." >&2
  exit 1
fi

port_busy() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
  elif command -v ss >/dev/null 2>&1; then
    ss -ltn "( sport = :$port )" 2>/dev/null | grep -q ":$port"
  else
    return 1
  fi
}

if port_busy 3000; then
  echo "Port 3000 is already in use." >&2
  echo "Stop the other process (often \`npm run dev\` / next-server) then retry." >&2
  echo "  macOS: lsof -nP -iTCP:3000 -sTCP:LISTEN" >&2
  exit 1
fi

ENV_FILE=".env.docker.local"
if [ ! -f "$ENV_FILE" ]; then
  echo "Creating $ENV_FILE (gitignored)…"
  umask 077
  cat > "$ENV_FILE" <<EOF
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
SUPER_ADMIN_EMAILS=ops@example.com
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
DEMO_MODE=true
ALLOW_BOOTSTRAP_SIGNUP=true
POSTGRES_USER=parkwise
POSTGRES_PASSWORD=parkwise
POSTGRES_DB=parkwise
EOF
fi

# Compose interpolates ${BETTER_AUTH_SECRET} from the shell env and/or a project .env file.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

wait_http() {
  local url="$1"
  local tries="${2:-60}"
  local i
  for i in $(seq 1 "$tries"); do
    if curl -sf "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

case "$MODE" in
  host-web)
    echo "Starting Postgres only (Next.js will run on the host)…"
    docker compose -f docker-compose.dev.yml --env-file "$ENV_FILE" up -d postgres
    echo "Waiting for Postgres…"
    for i in $(seq 1 30); do
      if docker compose -f docker-compose.dev.yml --env-file "$ENV_FILE" exec -T postgres pg_isready -U "${POSTGRES_USER:-parkwise}" >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done

    mkdir -p .data/documents
    if [ ! -f .env.local ]; then
      umask 077
      cat > .env.local <<EOF
DATABASE_URL=postgresql://${POSTGRES_USER:-parkwise}:${POSTGRES_PASSWORD:-parkwise}@127.0.0.1:${POSTGRES_PORT:-5432}/${POSTGRES_DB:-parkwise}
DOCUMENTS_DIR=$(pwd)/.data/documents
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
SUPER_ADMIN_EMAILS=${SUPER_ADMIN_EMAILS}
BETTER_AUTH_URL=${BETTER_AUTH_URL}
NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
DEMO_MODE=${DEMO_MODE:-true}
ALLOW_BOOTSTRAP_SIGNUP=${ALLOW_BOOTSTRAP_SIGNUP:-true}
EOF
    fi

    export PATH="${HOME}/.nvm/versions/node/v22.22.2/bin:${HOME}/.nvm/versions/node/v22.23.1/bin:${PATH}"
    if [ ! -d node_modules/next ]; then
      npm install --legacy-peer-deps
    fi
    set -a
    # shellcheck disable=SC1091
    source .env.local
    set +a
    npm run db:migrate
    npm run db:seed
    echo "Open http://localhost:3000  (Ctrl+C to stop Next; Postgres keeps running)"
    exec npm run dev
    ;;

  prod)
    echo "Starting production Compose stack (builds next — can take several minutes)…"
    docker compose --env-file "$ENV_FILE" up -d --build
    echo "Waiting for health…"
    if ! wait_http "http://127.0.0.1:3000/api/health" 90; then
      echo "Health check did not pass. Logs:" >&2
      docker compose --env-file "$ENV_FILE" logs --tail=80 web >&2 || true
      exit 1
    fi
    docker compose --env-file "$ENV_FILE" exec -T web npm run db:seed || true
    echo "Ready: http://localhost:3000"
    ;;

  dev)
    echo "Starting local Docker stack (next dev — no production build)…"
    docker compose -f docker-compose.dev.yml --env-file "$ENV_FILE" up -d
    echo "Waiting for http://localhost:3000/api/health …"
    if ! wait_http "http://127.0.0.1:3000/api/health" 120; then
      echo "Health check did not pass. Recent logs:" >&2
      docker compose -f docker-compose.dev.yml --env-file "$ENV_FILE" logs --tail=100 web >&2 || true
      exit 1
    fi
    echo "Ready: http://localhost:3000"
    echo "Logs: docker compose -f docker-compose.dev.yml logs -f web"
    echo "Stop: docker compose -f docker-compose.dev.yml down"
    ;;
esac
