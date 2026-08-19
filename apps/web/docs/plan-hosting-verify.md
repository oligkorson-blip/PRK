# One-server hosting verification

Branch / worktree: `one-server-crypto-hosting`

Automated gates (Task 10):

- [x] `npm test` — 13 files, 52 tests passed
- [x] `npm run build` — Next.js production build succeeded
- [ ] Local Docker Compose smoke — **skipped** when Docker is not installed on the runner

## Local Compose smoke (when Docker is available)

From `apps/web`:

```bash
export BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
export ADMIN_EMAILS="admin@example.com"
export BETTER_AUTH_URL="http://localhost:3000"
export NEXT_PUBLIC_APP_URL="http://localhost:3000"
docker compose up -d --build

docker compose exec web npm run db:migrate
docker compose exec web npm run db:seed

curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
# expect 200 or redirect (3xx)

curl -s http://127.0.0.1:3000/api/health
# expect {"ok":true}

curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/opportunities
# expect 200 after migrate + seed
```

Expected seed line: `Seeded 12 assets`.

Teardown:

```bash
docker compose down
```

## Manual product smoke (after compose or Coolify deploy)

- [ ] Home (`/`) loads
- [ ] `/api/health` returns ok
- [ ] Sign up → `/portal` creates an `investors` row
- [ ] Non-admin hitting `/admin` is redirected / forbidden
- [ ] Email in `ADMIN_EMAILS` can open `/admin`
- [ ] `/opportunities` lists the 12 seeded published assets
- [ ] Asset detail shows contractual target / capital-at-risk disclaimer
- [ ] With `DEMO_MODE=true`, demo banner is visible
- [ ] Admin PDF upload + investor download via `DOCUMENTS_DIR` / volume
- [ ] `./scripts/backup.sh` produces Postgres dump + documents copy

## Production (Njalla + Coolify)

See `docs/DEPLOY_NJALLA_COOLIFY.md` and `docs/PRODUCTION_CHECKLIST.md`.

- [ ] HTTPS origin matches `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL`
- [ ] Env set: `DATABASE_URL`, `DOCUMENTS_DIR`, `BETTER_AUTH_SECRET`, `ADMIN_EMAILS`, `DEMO_MODE`
- [ ] Migrate + seed on the web container
- [ ] Admin user registered with an `ADMIN_EMAILS` address
