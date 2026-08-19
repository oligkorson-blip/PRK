# Parkwise production operations runbook

This runbook is for the single-server Njalla + Coolify launch stack. Commands are
run from `apps/web` unless noted. Replace example domains and paths before use.

## Service objectives and probes

- `GET /api/health` is the **liveness** probe. It also verifies database
  connectivity and document-vault writability, returning 503 when either fails.
- `GET /api/ready` is the **readiness** probe. It returns 200 only when the latest
  expected database schema is queryable and the document vault is readable and
  writable. The response intentionally does not expose dependency details.
- Target initial availability: 99.5% monthly. Alert after two consecutive
  readiness failures (about one minute), disk usage above 80%, memory above 85%
  for 10 minutes, or a container restart loop.

Configure an external HTTPS monitor against `/api/ready`; an in-container check
cannot detect DNS, certificate, firewall, or reverse-proxy failures. Also monitor
certificate expiry and the public home page. Send alerts to at least two operators.

Useful read-only checks:

```bash
docker compose ps
docker compose logs --since 15m web
docker compose logs --since 15m postgres
curl --fail --silent --show-error https://your-domain.example/api/ready
df -h
docker stats --no-stream
```

Application and database logs go to stdout/stderr. Compose rotates each service's
local JSON logs at 10 MB × 3 files; Coolify may add its own log shipping. Never log
passwords, auth secrets, invite URLs, session cookies, document contents, or full
database connection strings. Configure reverse-proxy access logs to omit or redact
query strings for `/set-password` and `/reset-password`; both routes receive bearer
tokens in the URL. The app sends `Referrer-Policy: no-referrer` to prevent onward
propagation, but the initial proxy request still contains the token.

## Deploy procedure

1. Record the git commit or immutable image tag being deployed. Do not deploy an
   uncommitted working tree.
2. Confirm CI/release checks pass: unit tests, TypeScript, production build, and
   Docker image build.
3. On an existing production system, take and offload a verified backup before
   the deploy. First launch has no production data to preserve.
4. Review migrations. The container applies committed Drizzle migrations before
   it starts accepting traffic. It does **not** run the catalogue seed.
5. Deploy one web replica. Wait for both services to become healthy.
6. Verify `/api/ready`, HTTPS, sign-in, catalogue, admin authorization, document
   upload/download, public-signup closure, and SMTP forgot/reset-password delivery.
7. Watch web/Postgres logs, restart count, memory, disk, and latency for 15 minutes.

`npm run db:seed` is intentionally manual because it can delete interests and
holdings for removed catalogue slugs. In non-demo mode it additionally requires
`CONFIRM_SEED=1`. Take a backup and review the seed diff before using it.

## Backup policy

Run `./scripts/backup.sh` at least daily and before every production migration.
It creates a private, timestamped directory containing:

- `db.dump`: PostgreSQL custom-format dump;
- `documents.tar.gz`: document-vault archive;
- `SHA256SUMS`, `db.contents`, and `manifest.txt`: integrity and inventory data.

The backup is staged under a `.partial` name and published only after both archives
validate. Verify any copy with:

```bash
./scripts/verify-backup.sh ./backups/20260720T120000Z
```

Minimum launch policy:

- daily backup, with 7 daily and 4 weekly recovery points;
- encrypted copy on a different server/account after every run;
- backup destination credentials are different from production credentials;
- alert when a scheduled run or off-server copy fails;
- monthly restore drill into an isolated Compose project;
- do not consider a same-disk VPS copy a disaster-recovery backup.

For the cleanest application/database cut, enable maintenance mode or stop writes
during the backup. The script never stops production automatically.

## Restore drill (safe, isolated target)

Never test a restore against the live project. Prefer a fresh VPS. On the same host,
use a separate Compose project name, port, origin, and fresh volumes. Record the
recovery time and data timestamp. For a same-host drill, export isolated values
before running any command (and keep them set through step 5):

```bash
export COMPOSE_PROJECT_NAME=parkwise-restore
export WEB_PORT=3001
export BETTER_AUTH_URL=http://localhost:3001
export NEXT_PUBLIC_APP_URL=http://localhost:3001
```

1. Copy one timestamped backup directory to the isolated host and run
   `scripts/verify-backup.sh` while its temporary Postgres service is running.
2. Start only the fresh database:

   ```bash
   docker compose up -d postgres
   ```

3. Restore the dump into the empty database (use the same `POSTGRES_USER` and
   `POSTGRES_DB` values as the backup manifest):

   ```bash
   docker compose exec -T postgres pg_restore \
     --username parkwise --dbname parkwise --no-owner --no-privileges \
     --exit-on-error < /absolute/path/to/backup/db.dump
   ```

4. Start the fresh web service, then extract documents into its empty volume:

   ```bash
   docker compose up -d web
   docker compose exec -T web tar -xzf - -C /data/documents \
     < /absolute/path/to/backup/documents.tar.gz
   ```

5. Verify readiness, row counts, super-admin login, a known holding, and a known
   document download. Destroy the isolated drill environment only after recording
   results and only with explicit operator confirmation.

For a real disaster, restore to fresh volumes first and switch the Coolify route
only after validation. This preserves the failed system for investigation and
provides a fast switch-back path.

## Rollback and failed deploy

- If startup migration or environment validation fails, the web service never
  becomes ready. Read the first error in `docker compose logs web`; fix the config
  or migration, then redeploy.
- For a code-only regression with backward-compatible schema, redeploy the last
  known-good commit/image and verify readiness.
- Database migrations are forward-only. Do not invent `DROP`/reverse SQL during an
  incident. If a migration is incompatible with the old code, fix forward or
  restore the pre-deploy backup into fresh volumes and switch traffic.
- Preserve logs, the failed image/commit, migration name, and timestamps.

## Incident priorities

- **P0:** data exposure/loss, auth bypass, corrupted restore, or total outage.
  Disable public routing or affected write paths, preserve evidence, and notify the
  incident owner immediately.
- **P1:** readiness failure, repeated restarts, failed backups, disk above 90%, or
  core investor/admin flow unavailable. Stop deployments and restore service.
- **P2:** degraded non-core feature, noisy logs, or performance below target.

After any P0/P1, record impact, exact UTC timeline, root cause, recovery actions,
and prevention work. Rotate any secret that may have appeared in logs or backups.
