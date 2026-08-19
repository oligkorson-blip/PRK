# Deploy Parkwise on Njalla + Coolify (one server)

Beginner-friendly path: one VPS, Docker Compose (`web` + Postgres), Coolify for HTTPS. Paid vendor at launch is **Njalla** (crypto). Do **not** use Vercel, Clerk, Neon, R2, or Resend for launch.

Keep `DEMO_MODE=true` until counsel signs off on legal pages. Then use `docs/PRODUCTION_CHECKLIST.md` before flipping to `false`.

**Optional / out of v1:** self-hosted **Gitea** on the same VPS is a phase-2 option if you want to avoid GitHub entirely. Launch can deploy from any git URL Coolify accepts, or from a connected repo.

---

## 1. Buy domain + VPS on Njalla

1. Create a Njalla account and pay with crypto.
2. Register your domain (e.g. `parkwise.eu`).
3. Order a VPS with **≥2 GB RAM** (prefer **4 GB** if budget allows — Node + Postgres + Coolify share the box).
4. Note the VPS **public IPv4** address from the Njalla panel.

SSH in as root (or the user Njalla provides):

```bash
ssh root@YOUR_VPS_IP
```

---

## 2. Install Coolify (one-liner)

On the VPS (as root):

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

When it finishes, open the printed URL (usually `http://YOUR_VPS_IP:8000`) and complete the Coolify setup wizard (create the admin user).

Coolify installs Docker and a reverse proxy (Let’s Encrypt HTTPS) for you.

---

## 3. Point DNS at the VPS (after admin bootstrap preferred)

**Ops order:** Prefer bringing the stack up on the VPS IP (Coolify / SSH) first, migrate + seed, then register the `SUPER_ADMIN_EMAILS` account (section 7) **before** publishing a public hostname — or keep `DEMO_MODE=true` and treat the public URL as private until that ops account exists. Do **not** leave open signup on a public URL with no super-admin account registered yet.

When you are ready for the public hostname, in the Njalla DNS UI for your domain:

| Type | Name | Value |
|------|------|--------|
| **A** | `@` (or blank) | `YOUR_VPS_IP` |
| **A** | `www` (optional) | `YOUR_VPS_IP` |

Wait until DNS resolves (often a few minutes):

```bash
dig +short your-domain.example
# should print YOUR_VPS_IP
```

---

## 4. Deploy the Compose stack in Coolify

Compose file in the repo: `apps/web/docker-compose.yml` (services: `web`, `postgres`; volumes: Postgres data + `/data/documents`).

### Option A — Coolify UI (recommended)

1. In Coolify: **New Resource** → **Docker Compose**.
2. Connect your git source (GitHub is fine for v1; Gitea is optional phase-2).
3. Set the **Base Directory** / compose path so Coolify uses `apps/web/docker-compose.yml` (or paste/upload that compose if deploying without git).
4. Set the public domain on the `web` service (e.g. `https://your-domain.example`) and enable HTTPS / Let’s Encrypt in Coolify.
5. Add environment variables (section 5 below).
6. Deploy / start the stack.

### Option B — SSH + Compose (same files)

From a checkout of the repo on the VPS:

```bash
cd /path/to/parkwise-platform/apps/web
cp .env.example .env
# edit .env — set BETTER_AUTH_SECRET, SUPER_ADMIN_EMAILS, and public URLs (https://your-domain.example)
docker compose up -d --build
```

For local compose, map public URLs via env (see `docker-compose.yml`):

```bash
export BETTER_AUTH_SECRET="$(openssl rand -base64 32)"
export SUPER_ADMIN_EMAILS="ops@your-domain.example"
export BETTER_AUTH_URL="https://your-domain.example"
export NEXT_PUBLIC_APP_URL="https://your-domain.example"
docker compose up -d --build
```

---

## 5. Environment variables

Set these in Coolify (or `.env` next to compose). Production values:

| Variable | Example / notes |
|----------|-----------------|
| `DATABASE_URL` | Compose sets `postgresql://parkwise:parkwise@postgres:5432/parkwise` for the `web` service — keep that on Docker network |
| `DOCUMENTS_DIR` | `/data/documents` (compose mounts the volume here) |
| `DEMO_MODE` | `true` until legal sign-off |
| `SUPER_ADMIN_EMAILS` | Comma-separated super-admin emails, e.g. `ops@your-domain.example` |
| `ADMIN_EMAILS` | **Deprecated** — fallback only if `SUPER_ADMIN_EMAILS` is unset |
| `BETTER_AUTH_SECRET` | Long random string (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | `https://your-domain.example` |
| `NEXT_PUBLIC_APP_URL` | Same origin as `BETTER_AUTH_URL` |

Generate a secret:

```bash
openssl rand -base64 32
```

---

## 6. Migrate and seed the database

After `web` and `postgres` are healthy:

```bash
# from apps/web (compose project directory)
docker compose exec web npm run db:migrate
# equivalent: docker compose exec web npx drizzle-kit migrate

docker compose exec web npm run db:seed
```

Expected seed line: `Seeded N assets; …` with **N ≥ 24** (current catalogue size from `scripts/seed-data.json`).

If Coolify wraps the project differently, open a terminal on the **web** container in the Coolify UI and run the same two commands.

---

## 7. Create the super-admin user (before public traffic)

Do this **immediately after migrate/seed**, while access is still IP-only / not advertised:

1. Set `ALLOW_BOOTSTRAP_SIGNUP=true` and restart the web service.
2. Open `/sign-up` on the deploy origin (IP or hostname you control).
3. Register **only** with an email listed in `SUPER_ADMIN_EMAILS` — other emails are rejected. This creates the ops super-admin (`staff_profiles` upserted as `super_admin`).
4. Sign in → visit `/admin` (should load). Promote agents on `/admin/staff` and assign investors on `/admin/investors` as needed (see `docs/plan-ops-phase1-verify.md`).
5. **Unset `ALLOW_BOOTSTRAP_SIGNUP`** and restart. Public investors use **`/apply`**, not `/sign-up`.
6. Only then point public DNS / share the URL (if you deferred DNS in section 3).
7. A non-staff account must not access `/admin`.

Restart / redeploy after changing `SUPER_ADMIN_EMAILS` or `ALLOW_BOOTSTRAP_SIGNUP`.

---

## 8. Smoke checklist

- [ ] `https://your-domain.example` loads over HTTPS (Coolify / Let’s Encrypt)
- [ ] `DEMO_MODE=true` shows the demo banner
- [ ] `/opportunities` lists seeded assets
- [ ] Sign up is **closed** publicly (`ALLOW_BOOTSTRAP_SIGNUP` unset); investors use `/apply`
- [ ] Optional: configure `SMTP_*` before relying on invite email (otherwise admin shows invite URL for manual delivery)
- [ ] Admin confirms interest → holding visible
- [ ] Admin uploads a PDF → investor can download from vault
- [ ] Non-staff cannot open `/admin`; super admin in `SUPER_ADMIN_EMAILS` can
- [ ] Backups: run `apps/web/scripts/backup.sh` (or schedule it) — Postgres dump + documents volume

Transactional email is **not** required at launch (interest emails skip-log; use the admin queue).

---

## 9. Backup & restore

`apps/web/scripts/backup.sh` writes `./backups/<UTC-timestamp>/` containing:

- `db.sql.gz` — gzipped `pg_dump` (or `db.sql.gz.gpg` when encrypted, see below)
- `documents/` — copy of the documents volume (`/data/documents`)

It then prunes timestamped backup dirs older than the retention window and, when configured, mirrors the new backup offsite. Env knobs:

| Variable | Default | Notes |
|----------|---------|-------|
| `BACKUP_DIR` | `./backups` | Backup root |
| `BACKUP_RETENTION_DAYS` | `14` | Timestamped backup dirs older than this are deleted after each run |
| `GPG_RECIPIENT` | unset | When set, the dump is GPG-encrypted to this key (`db.sql.gz.gpg`); plaintext never touches disk |
| `BACKUP_OFFSITE_DIR` | unset | When set, the new backup dir is copied here with `rsync -a` (mounted storage, rclone mount, sshfs…) |

From `apps/web` on a host that can talk to the compose project:

```bash
./scripts/backup.sh
```

### Schedule (cron)

Example daily 03:15 UTC, 30-day retention:

```bash
15 3 * * * cd /path/to/parkwise-platform/apps/web && BACKUP_RETENTION_DAYS=30 ./scripts/backup.sh >> /var/log/parkwise-backup.log 2>&1
```

### Encryption (recommended for offsite copies)

Generate a backup keypair **off** the VPS, keep the private key there, and import only the public key on the VPS:

```bash
gpg --gen-key                                  # on your ops machine, not the VPS
gpg --export backup@your-domain.example > backup-pub.asc
scp backup-pub.asc root@YOUR_VPS_IP:
gpg --import backup-pub.asc                    # on the VPS
```

Then run backups with `GPG_RECIPIENT=backup@your-domain.example ./scripts/backup.sh`. Restoring an encrypted dump needs the **private** key (`gpg --decrypt` runs inside `restore.sh`).

### Offsite copy

Simplest: `BACKUP_OFFSITE_DIR` pointing at any mounted path. Alternatives:

```bash
# rsync to a second host (run after backup.sh, from apps/web)
rsync -a ./backups/ backup-user@offsite-host:/srv/parkwise-backups/

# rclone to object storage (configure the remote once with `rclone config`)
rclone sync ./backups remote:parkwise-backups --exclude "pre-restore-*"
```

Encrypt (`GPG_RECIPIENT`) before syncing to storage you do not control.

### Restore drill

Do this periodically — a backup you have never restored is a hope, not a backup:

1. Pick a backup dir (e.g. `./backups/20260701T031500Z`). For a real drill, restore into a **separate** local compose checkout, not production.
2. `docker compose stop web` so the app holds no DB connections during the restore.
3. Run `./scripts/restore.sh ./backups/20260701T031500Z` and type `RESTORE` when prompted. The script first writes a pre-restore safety dump to `./backups/pre-restore-<timestamp>/db.sql.gz`, then drops/recreates the `public` schema, loads the dump (decrypting first for `db.sql.gz.gpg`), and copies `documents/` back into the volume.
4. `docker compose start web`, then verify: sign in, check `/opportunities`, open an investor document from the vault.
5. Keep or delete the `pre-restore-*` safety dump once verified.

`restore.sh` is non-interactive-capable via `RESTORE_CONFIRM=RESTORE` for automation — use that only in scripts you trust; the confirmation prompt exists because the restore is destructive.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Auth redirects / cookie errors | `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` must be the **https** public origin |
| `/admin` forbidden | Email must match `SUPER_ADMIN_EMAILS` or be a promoted agent; redeploy after env edits |
| Empty catalogue | Run migrate + seed inside the `web` container |
| Document upload disabled | Ensure `DOCUMENTS_DIR=/data/documents` and the volume is mounted |
| Coolify UI unreachable | Check VPS firewall allows port `8000` (and `80`/`443` for the app) |
