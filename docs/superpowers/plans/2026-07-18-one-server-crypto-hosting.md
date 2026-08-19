# Parkwise One-Server Crypto-Paid Hosting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `apps/web` off Clerk/Neon/R2/Resend/Vercel onto self-hosted Better Auth, local Postgres, filesystem document storage, and Docker/Coolify so the MVP can run on one Njalla VPS paid in crypto.

**Architecture:** Keep product flows from Plans 1–3. Replace auth provider and storage adapters only. Switch Drizzle to a TCP Postgres driver suitable for Docker Postgres. Ship `Dockerfile` + `docker-compose.yml` and rewrite SETUP/production docs for Coolify on Njalla. Email stays no-op at launch.

**Tech Stack:** Next.js 15, Better Auth, Drizzle + `postgres` (postgres.js), local filesystem volume, Docker Compose, Coolify, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-18-one-server-crypto-hosting-design.md`
- Product rules still from: `docs/superpowers/specs/2026-07-18-investor-platform-mvp-design.md`
- Preserve Parkwise brand and risk language; never say yields are guaranteed
- No payments, KYC vendor, secondary market, or on-chain product features
- Paid launch vendor is Njalla only; do not reintroduce Clerk/Neon/R2/Resend/Vercel as required
- Do not commit secrets; `.env.local` stays gitignored
- Prefer Better Auth; fall back to Auth.js only if Better Auth blocks App Router
- Commit with: `git -c user.email="parkwise@local" -c user.name="Parkwise"` when committing in this repo
- Work in a git worktree on a feature branch when implementing

## File Structure (primary)

```
apps/web/
  lib/db/client.ts                 # postgres.js + drizzle-orm/postgres-js
  lib/db/schema.ts                 # auth_user_id, actor_user_id, storage_key
  lib/auth/auth.ts                 # Better Auth instance
  lib/auth/session.ts              # getSessionUser helpers
  lib/auth/roles.ts                # ADMIN_EMAILS / role check
  lib/auth/investor.ts             # ensureInvestor / requireAdmin
  lib/storage/local.ts             # filesystem put/get/key builder
  app/api/auth/[...all]/route.ts   # Better Auth handler
  app/sign-in/page.tsx             # email/password forms (replace Clerk catch-all)
  app/sign-up/page.tsx
  middleware.ts                    # session cookie gate
  Dockerfile
  docker-compose.yml
  scripts/backup.sh                # postgres dump + documents copy
  docs/SETUP.md
  docs/PRODUCTION_CHECKLIST.md
  docs/DEPLOY_NJALLA_COOLIFY.md
  .env.example
```

---

### Task 1: Switch DB client to Postgres TCP (Docker-ready)

**Files:**
- Modify: `apps/web/lib/db/client.ts`
- Modify: `apps/web/package.json` (add `postgres`, remove `@neondatabase/serverless` when unused)
- Test: existing `npm test` still passes without live DB

**Interfaces:**
- Produces: `createDb(databaseUrl?: string)`, `getDb()`, lazy `db` proxy — same export names as today
- Consumes: `DATABASE_URL` (Postgres URL, e.g. `postgresql://parkwise:parkwise@postgres:5432/parkwise`)

- [ ] **Step 1: Add dependency**

```bash
cd apps/web
npm install postgres
```

- [ ] **Step 2: Replace client implementation**

```ts
// lib/db/client.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDb(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const client = postgres(databaseUrl, { max: 10 });
  return drizzle(client, { schema });
}

type Db = ReturnType<typeof createDb>;
let _db: Db | undefined;

export function getDb(): Db {
  if (!_db) _db = createDb();
  return _db;
}

export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  }
}) as Db;
```

- [ ] **Step 3: Run unit tests (no DB required for most)**

```bash
cd apps/web && npm test
```

Expected: all existing unit tests pass (or only fail later if something imported neon types — fix imports).

- [ ] **Step 4: Remove Neon package when nothing imports it**

```bash
cd apps/web && npm uninstall @neondatabase/serverless
```

- [ ] **Step 5: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/lib/db/client.ts apps/web/package.json apps/web/package-lock.json
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
switch Drizzle client to postgres.js for self-hosted Postgres

EOF
)"
```

---

### Task 2: Rename Clerk-flavored columns + storage key

**Files:**
- Modify: `apps/web/lib/db/schema.ts`
- Create migration via `npm run db:generate` → `apps/web/drizzle/0003_*.sql`
- Modify all TypeScript references to `clerkUserId` / `actorClerkId` / `r2Key`
- Test: `apps/web/tests/roles.test.ts` updated in Task 5; schema compile via `npm run build` later

**Interfaces:**
- Produces schema fields:
  - `investors.authUserId` → column `auth_user_id`
  - `auditEvents.actorUserId` → column `actor_user_id`
  - `documents.storageKey` → column `storage_key` (replaces `r2_key`)

- [ ] **Step 1: Update schema.ts field names**

In `investors`, replace `clerkUserId` with:

```ts
authUserId: text("auth_user_id").notNull().unique(),
```

In `auditEvents`, replace `actorClerkId` with:

```ts
actorUserId: text("actor_user_id").notNull(),
```

In `documents`, replace `r2Key` with:

```ts
storageKey: text("storage_key").notNull(),
```

- [ ] **Step 2: Generate migration**

```bash
cd apps/web && npm run db:generate
```

Expected: new SQL under `drizzle/` that renames columns (or drops/recreates if greenfield — for greenfield VPS, rename SQL is fine; document that empty DB is expected).

- [ ] **Step 3: Repo-wide replace usages**

Update every `clerkUserId` → `authUserId`, `actorClerkId` → `actorUserId`, `r2Key` → `storageKey` in `apps/web` (actions, pages, tests). Keep string action names in audit payloads unchanged unless they embed clerk ids.

- [ ] **Step 4: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/lib/db/schema.ts apps/web/drizzle apps/web/lib apps/web/app apps/web/components
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
rename clerk and r2 columns for self-hosted auth and storage

EOF
)"
```

---

### Task 3: Local filesystem document storage

**Files:**
- Create: `apps/web/lib/storage/local.ts`
- Create: `apps/web/tests/local-storage-key.test.ts`
- Modify: `apps/web/lib/documents/actions.ts` (use local put; store `storageKey`)
- Modify: `apps/web/app/api/documents/[id]/download/route.ts` (stream file from disk)
- Delete or stop importing: `apps/web/lib/storage/r2.ts`
- Modify: `apps/web/tests/r2-key.test.ts` → replace with local key tests (or delete r2 test)
- Modify: `apps/web/.env.example` — `DOCUMENTS_DIR=/data/documents`

**Interfaces:**
- Produces:
  - `buildObjectKey(parts: { ownerType: string; ownerId: string | null; filename: string }): string` (same key shape as R2: `docs/...`)
  - `isStorageConfigured(): boolean` — true when `DOCUMENTS_DIR` set and writable path exists or can be created
  - `putObject(key: string, body: Buffer, contentType: string): Promise<void>`
  - `resolveObjectPath(key: string): string` — absolute path under `DOCUMENTS_DIR`; reject keys with `..`
  - `readObject(key: string): Promise<Buffer>`

- [ ] **Step 1: Failing test for key + path safety**

```ts
// tests/local-storage-key.test.ts
import { describe, expect, it } from "vitest";
import { buildObjectKey, resolveObjectPath } from "@/lib/storage/local";

describe("local storage keys", () => {
  it("builds stable prefixed keys without path traversal in the name", () => {
    const key = buildObjectKey({
      ownerType: "asset",
      ownerId: "11111111-1111-1111-1111-111111111111",
      filename: "../../evil.pdf"
    });
    expect(key.startsWith("docs/asset/11111111-1111-1111-1111-111111111111/")).toBe(true);
    expect(key.includes("..")).toBe(false);
  });

  it("rejects keys that escape the documents root", () => {
    process.env.DOCUMENTS_DIR = "/tmp/parkwise-docs-test";
    expect(() => resolveObjectPath("../outside.pdf")).toThrow();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd apps/web && npx vitest run tests/local-storage-key.test.ts
```

Expected: FAIL (module missing)

- [ ] **Step 3: Implement `lib/storage/local.ts`**

```ts
import fs from "node:fs/promises";
import path from "node:path";

export function buildObjectKey(parts: {
  ownerType: string;
  ownerId: string | null;
  filename: string;
}): string {
  const safeName =
    path
      .basename(parts.filename)
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/^\.+/, "") || "file.pdf";
  const ownerSegment = parts.ownerId ?? "platform";
  return `docs/${parts.ownerType}/${ownerSegment}/${Date.now()}-${safeName}`;
}

export function documentsRoot(): string {
  const root = process.env.DOCUMENTS_DIR;
  if (!root) throw new Error("DOCUMENTS_DIR is not set");
  return path.resolve(root);
}

export function isStorageConfigured(): boolean {
  return Boolean(process.env.DOCUMENTS_DIR);
}

export function resolveObjectPath(key: string): string {
  if (!key || key.includes("..") || path.isAbsolute(key)) {
    throw new Error("Invalid storage key");
  }
  const root = documentsRoot();
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep) && full !== root) {
    throw new Error("Invalid storage key");
  }
  return full;
}

export async function putObject(key: string, body: Buffer, _contentType: string): Promise<void> {
  const full = resolveObjectPath(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, body);
}

export async function readObject(key: string): Promise<Buffer> {
  return fs.readFile(resolveObjectPath(key));
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd apps/web && npx vitest run tests/local-storage-key.test.ts
```

- [ ] **Step 5: Wire documents actions + download route**

- `uploadDocument`: call `isStorageConfigured` / `putObject`; insert `storageKey` instead of `r2Key`.
- Download route: after authz, `readObject(doc.storageKey)` and return `Response` with `Content-Type` and attachment disposition (no redirect to presigned URL).
- Delete `lib/storage/r2.ts` and AWS SDK deps when unused:

```bash
cd apps/web && npm uninstall @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

- [ ] **Step 6: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/lib/storage apps/web/lib/documents apps/web/app/api/documents apps/web/tests apps/web/package.json apps/web/package-lock.json apps/web/.env.example
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
store document vault files on local disk instead of R2

EOF
)"
```

---

### Task 4: Better Auth core (instance + API route)

**Files:**
- Create: `apps/web/lib/auth/auth.ts`
- Create: `apps/web/app/api/auth/[...all]/route.ts`
- Modify: `apps/web/package.json` — add `better-auth`
- Modify: `apps/web/.env.example` — `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ADMIN_EMAILS`
- Better Auth Drizzle tables: follow Better Auth drizzle adapter docs — add required auth tables to schema **or** use adapter-managed migrations as documented for the installed Better Auth version

**Interfaces:**
- Produces:
  - `auth` — Better Auth instance with `emailAndPassword: { enabled: true }`
  - Route handlers exporting `GET` / `POST` from `toNextJsHandler(auth)` (or current Better Auth Next helper)
- Consumes: `BETTER_AUTH_SECRET` (≥32 chars), `BETTER_AUTH_URL` (public origin, e.g. `https://invest.example.com` or `http://localhost:3000`), `DATABASE_URL`

- [ ] **Step 1: Install**

```bash
cd apps/web && npm install better-auth
```

- [ ] **Step 2: Create `lib/auth/auth.ts`**

Use Better Auth + Drizzle adapter bound to the same Postgres. Enable email/password only. Exact adapter import paths must match the installed `better-auth` version’s docs — do not invent table shapes; copy from official drizzle example for that version into `schema.ts` if required, then `db:generate`.

Minimal shape (adjust imports to match package version):

```ts
// lib/auth/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL
});
```

- [ ] **Step 3: API route**

```ts
// app/api/auth/[...all]/route.ts
import { auth } from "@/lib/auth/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

(If the package exports a different helper name in the pinned version, use that helper — keep the catch-all path `/api/auth/[...all]`.)

- [ ] **Step 4: Commit auth scaffolding + any new auth tables/migration**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/lib/auth/auth.ts apps/web/app/api/auth apps/web/lib/db apps/web/drizzle apps/web/package.json apps/web/package-lock.json apps/web/.env.example
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
add Better Auth email/password API for self-hosted login

EOF
)"
```

---

### Task 5: Session helpers, admin emails, ensureInvestor

**Files:**
- Create: `apps/web/lib/auth/session.ts`
- Modify: `apps/web/lib/auth/roles.ts`
- Modify: `apps/web/lib/auth/investor.ts`
- Modify: `apps/web/tests/roles.test.ts`

**Interfaces:**
- Produces:
  - `getSessionUser(): Promise<{ id: string; email: string } | null>`
  - `requireSessionUser(): Promise<{ id: string; email: string }>`
  - `isAdminEmail(email: string): boolean` — true if email is in `ADMIN_EMAILS` (comma-separated, case-insensitive trim)
  - `isAdmin(user: { email: string } | null | undefined): boolean`
  - `ensureInvestor()` — upsert by `authUserId`
  - `requireAdmin()` — throws `FORBIDDEN` unless session email is admin

- [ ] **Step 1: Failing roles tests**

```ts
// tests/roles.test.ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { isAdmin, isAdminEmail } from "@/lib/auth/roles";

describe("admin emails", () => {
  const prev = process.env.ADMIN_EMAILS;
  beforeEach(() => {
    process.env.ADMIN_EMAILS = "ops@parkwise.eu, Admin@Example.com";
  });
  afterEach(() => {
    process.env.ADMIN_EMAILS = prev;
  });

  it("matches ADMIN_EMAILS case-insensitively", () => {
    expect(isAdminEmail("ops@parkwise.eu")).toBe(true);
    expect(isAdminEmail("admin@example.com")).toBe(true);
    expect(isAdminEmail("other@example.com")).toBe(false);
  });

  it("isAdmin uses email list", () => {
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin({ email: "ops@parkwise.eu" })).toBe(true);
    expect(isAdmin({ email: "nope@x.com" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/web && npx vitest run tests/roles.test.ts
```

- [ ] **Step 3: Implement roles + session + investor**

```ts
// lib/auth/roles.ts
export function isAdminEmail(email: string): boolean {
  const raw = process.env.ADMIN_EMAILS ?? "";
  const set = new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  return set.has(email.trim().toLowerCase());
}

export function isAdmin(user: { email: string } | null | undefined): boolean {
  if (!user?.email) return false;
  return isAdminEmail(user.email);
}
```

```ts
// lib/auth/session.ts
import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";

export async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id || !session.user.email) return null;
  return { id: session.user.id, email: session.user.email };
}

export async function requireSessionUser() {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}
```

Rewrite `ensureInvestor` / `requireAdmin` to use `requireSessionUser`, `authUserId`, `actorUserId`, and `isAdmin({ email })` — no Clerk imports.

- [ ] **Step 4: Run roles tests — PASS**

```bash
cd apps/web && npx vitest run tests/roles.test.ts
```

- [ ] **Step 5: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/lib/auth apps/web/tests/roles.test.ts
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
wire investor bootstrap and ADMIN_EMAILS to Better Auth sessions

EOF
)"
```

---

### Task 6: Middleware + sign-in/sign-up UI + remove ClerkProvider

**Files:**
- Modify: `apps/web/middleware.ts`
- Replace: `apps/web/app/sign-in/[[...sign-in]]/page.tsx` → `apps/web/app/sign-in/page.tsx`
- Replace: `apps/web/app/sign-up/[[...sign-up]]/page.tsx` → `apps/web/app/sign-up/page.tsx`
- Modify: `apps/web/app/layout.tsx` (remove `ClerkProvider`)
- Modify: `apps/web/components/site-header.tsx` (sign-out via Better Auth client)
- Create client helpers as needed: `apps/web/lib/auth/client.ts` (`createAuthClient` from `better-auth/react`)

**Interfaces:**
- Middleware redirects unauthenticated users from `/portal`, `/admin`, `/onboarding` to `/sign-in`
- Sign-up/sign-in forms POST to Better Auth email/password endpoints via client SDK

- [ ] **Step 1: Auth client**

```ts
// lib/auth/client.ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL
});
```

Add `NEXT_PUBLIC_APP_URL` to `.env.example` (same origin as `BETTER_AUTH_URL`).

- [ ] **Step 2: Simple sign-in / sign-up pages**

Client forms calling `authClient.signIn.email` / `authClient.signUp.email` with email + password; on success `router.push("/portal")`. Match existing Parkwise form CSS classes (`form-error`, etc.) — no new design system.

- [ ] **Step 3: Middleware with Better Auth cookies**

Use the Better Auth Next.js middleware helper for the installed version (e.g. `getSessionCookie` + redirect). Protect `/portal(.*)`, `/admin(.*)`, `/onboarding(.*)`.

- [ ] **Step 4: Header + layout**

Remove all `@clerk/nextjs` imports. Sign-out button calls `authClient.signOut()`.

- [ ] **Step 5: Uninstall Clerk**

```bash
cd apps/web && npm uninstall @clerk/nextjs
```

- [ ] **Step 6: `npm test` + `npm run build`**

Fix any remaining Clerk type errors.

- [ ] **Step 7: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
replace Clerk UI and middleware with Better Auth pages

EOF
)"
```

---

### Task 7: Sweep remaining Clerk/Resend call sites

**Files:**
- Modify every file still importing `@clerk/nextjs` or `currentUser` / `auth` from Clerk (grep the repo)
- Modify: `apps/web/lib/interests/actions.ts` — keep calling `sendTransactionalEmail` but ensure skip-without-key remains; optionally force-skip by removing Resend dependency
- Modify: `apps/web/lib/email/resend.ts` → rename to `lib/email/send.ts` that always logs+skips unless `SMTP` added later (YAGNI: keep skip behavior, uninstall `resend` package)
- Modify pages that used Clerk for display names

- [ ] **Step 1: Grep clean**

```bash
cd apps/web && rg "@clerk|RESEND_|from \"@/lib/email/resend\"|neon" -g '*.{ts,tsx,md,example}'
```

Expected after fixes: no Clerk; Resend only mentioned as “not used” in docs.

- [ ] **Step 2: Uninstall resend if unused**

```bash
cd apps/web && npm uninstall resend
```

- [ ] **Step 3: Full test + build**

```bash
cd apps/web && npm test && npm run build
```

Expected: tests pass; build succeeds with placeholder env if needed for build-time.

- [ ] **Step 4: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
remove residual Clerk and Resend launch dependencies

EOF
)"
```

---

### Task 8: Docker Compose + Dockerfile + backup script

**Files:**
- Create: `apps/web/Dockerfile`
- Create: `apps/web/docker-compose.yml`
- Create: `apps/web/scripts/backup.sh`
- Create: `apps/web/.dockerignore`

**Interfaces:**
- Compose services: `web` (Next start), `postgres:16`
- Volume: `documents_data` → `/data/documents`
- Volume: `postgres_data`
- Env for web: `DATABASE_URL`, `DOCUMENTS_DIR=/data/documents`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `ADMIN_EMAILS`, `DEMO_MODE=true`

- [ ] **Step 1: Dockerfile** (multi-stage Node 22)

```dockerfile
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts ./scripts
EXPOSE 3000
CMD ["npm", "run", "start"]
```

Adjust if `public/` is missing (create empty `public/.gitkeep` if needed).

- [ ] **Step 2: docker-compose.yml**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: parkwise
      POSTGRES_PASSWORD: parkwise
      POSTGRES_DB: parkwise
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  web:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://parkwise:parkwise@postgres:5432/parkwise
      DOCUMENTS_DIR: /data/documents
      DEMO_MODE: "true"
      BETTER_AUTH_URL: ${BETTER_AUTH_URL:-http://localhost:3000}
      NEXT_PUBLIC_APP_URL: ${NEXT_PUBLIC_APP_URL:-http://localhost:3000}
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET}
      ADMIN_EMAILS: ${ADMIN_EMAILS}
    volumes:
      - documents_data:/data/documents
    depends_on:
      - postgres
    restart: unless-stopped

volumes:
  postgres_data:
  documents_data:
```

- [ ] **Step 3: backup.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT=${BACKUP_DIR:-./backups}/$STAMP
mkdir -p "$OUT"
docker compose exec -T postgres pg_dump -U parkwise parkwise > "$OUT/db.sql"
docker compose cp web:/data/documents "$OUT/documents"
echo "Backup written to $OUT"
```

- [ ] **Step 4: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/Dockerfile apps/web/docker-compose.yml apps/web/scripts/backup.sh apps/web/.dockerignore apps/web/public
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
add Docker Compose stack for one-server Coolify deploy

EOF
)"
```

---

### Task 9: Docs + env example + verify checklist

**Files:**
- Rewrite: `apps/web/docs/SETUP.md` (local + Docker; remove Clerk/Neon/R2/Resend as required)
- Rewrite: `apps/web/docs/PRODUCTION_CHECKLIST.md` for Njalla/Coolify + `DEMO_MODE`
- Create: `apps/web/docs/DEPLOY_NJALLA_COOLIFY.md` (click/copy-paste: buy VPS, install Coolify, point DNS, set env, migrate/seed, create admin)
- Modify: `apps/web/.env.example`
- Update roadmap lines in SETUP that still say Plan 3 in progress / Clerk hosting

**`.env.example` contents:**

```env
DATABASE_URL=postgresql://parkwise:parkwise@localhost:5432/parkwise
DOCUMENTS_DIR=./.data/documents
DEMO_MODE=true
ADMIN_EMAILS=ops@parkwise.eu
BETTER_AUTH_SECRET=change-me-to-a-long-random-string
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 1: Write DEPLOY_NJALLA_COOLIFY.md** covering: Njalla domain+VPS (≥2 GB), Coolify install one-liner, DNS A record, deploy compose, env vars, `docker compose exec web npx drizzle-kit migrate` (or documented migrate command), `npm run db:seed`, sign up as admin email, smoke checklist.

- [ ] **Step 2: Align PRODUCTION_CHECKLIST** — remove Vercel/Clerk/R2/Resend required boxes; add Coolify HTTPS, backups, `ADMIN_EMAILS`, local volume private.

- [ ] **Step 3: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/docs apps/web/.env.example
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
document Njalla Coolify one-server deploy and update setup

EOF
)"
```

---

### Task 10: Final verification gate

**Files:** none new — verify only

- [ ] **Step 1: Unit tests**

```bash
cd apps/web && npm test
```

Expected: all pass.

- [ ] **Step 2: Production build**

```bash
cd apps/web && npm run build
```

Expected: success.

- [ ] **Step 3: Optional local compose smoke** (if Docker available)

```bash
cd apps/web
export BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
export ADMIN_EMAILS="admin@example.com"
docker compose up -d --build
# migrate + seed via compose exec as documented
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
```

Expected: `200` or app redirect; fix port/env issues if not.

- [ ] **Step 4: Write `apps/web/docs/plan-hosting-verify.md`** checklist mirroring smoke steps.

- [ ] **Step 5: Commit verify doc if created**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/docs/plan-hosting-verify.md
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
add one-server hosting verification checklist

EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| Njalla + Coolify one box | 8, 9 |
| Better Auth email/password | 4, 5, 6 |
| `auth_user_id` / admin via `ADMIN_EMAILS` | 2, 5 |
| Postgres on VPS + Drizzle | 1, 8 |
| Local document volume | 3, 8 |
| No Resend at launch | 7 |
| Remove Clerk/Neon/R2 launch deps | 1, 3, 6, 7 |
| `DEMO_MODE` + backups docs | 8, 9 |
| Beginner deploy runbook | 9 |
| Gitea optional phase-2 | Documented as out of v1 in Task 9 (explicit non-goal) |

## Placeholder / consistency notes

- Better Auth helper export names must match the **installed** package version; Tasks 4–6 allow swapping the official Next helper name without changing routes or product behavior.
- Greenfield DB assumed; no Clerk user migration tooling.
