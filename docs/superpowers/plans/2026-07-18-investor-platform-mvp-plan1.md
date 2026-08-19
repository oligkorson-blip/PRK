# Parkwise Investor Platform MVP — Plan 1: Foundations, Auth, Catalogue

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Next.js app, wire Clerk auth with investor records and admin role gates, and ship a Postgres-backed public opportunities catalogue seeded from the existing static data.

**Architecture:** Greenfield `apps/web` Next.js App Router app inside this repo. Clerk handles sessions; Drizzle + Neon hold domain data; marketing and catalogue pages reuse the existing Parkwise visual tokens. This plan does not implement express-interest, onboarding questionnaires, holdings, R2, or Resend (Plan 2).

**Tech Stack:** Next.js 15, React 19, TypeScript, Clerk, Drizzle ORM, Neon Postgres, Vitest, Playwright (install only; catalogue E2E in Task 6).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-18-investor-platform-mvp-design.md`
- Preserve green/cream/lime/mint/orange palette and Archivo / Inter / Fraunces typography
- Never label yields as guaranteed; keep capital-at-risk disclaimer on money surfaces
- Commitment model is express-interest only (not built in Plan 1)
- Auth is Clerk; admin role is Clerk `publicMetadata.role === "admin"`
- Database is Neon Postgres via `DATABASE_URL`
- Host target is Vercel; local dev uses `.env.local` (never commit secrets)
- `DEMO_MODE=true` shows a persistent demo banner
- Do not remove root static HTML in Plan 1; document dual-run in README
- No payment, KYC vendor, or R2 work in Plan 1

## File Structure

```
apps/web/
  package.json
  tsconfig.json
  next.config.ts
  drizzle.config.ts
  .env.example
  vitest.config.ts
  app/
    layout.tsx
    page.tsx
    globals.css
    opportunities/page.tsx
    opportunities/[slug]/page.tsx
    sign-in/[[...sign-in]]/page.tsx
    sign-up/[[...sign-up]]/page.tsx
    portal/page.tsx
    admin/page.tsx
    api/health/route.ts
  components/
    site-header.tsx
    site-footer.tsx
    demo-banner.tsx
    asset-card.tsx
  lib/
    db/client.ts
    db/schema.ts
    db/index.ts
    auth/roles.ts
    auth/investor.ts
    format.ts
  scripts/
    seed-assets.ts
    export-static-assets.mjs
  tests/
    roles.test.ts
    format.test.ts
    interests-validation.test.ts
middleware.ts
```

Plan 2 will add onboarding, interests, holdings, documents, email.

---

### Task 1: Scaffold `apps/web` and dual-run docs

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/.env.example`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx`
- Create: `apps/web/app/globals.css`
- Create: `apps/web/app/api/health/route.ts`
- Create: `apps/web/vitest.config.ts`
- Modify: `README.md` (create if missing)

**Interfaces:**
- Consumes: none
- Produces: runnable Next.js app on port 3000; `GET /api/health` → `{ "ok": true }`

- [ ] **Step 1: Create the app package manifest**

Create `apps/web/package.json`:

```json
{
  "name": "@parkwise/web",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:seed": "tsx scripts/seed-assets.ts"
  },
  "dependencies": {
    "@clerk/nextjs": "^6.12.0",
    "drizzle-orm": "^0.39.0",
    "@neondatabase/serverless": "^0.10.4",
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "drizzle-kit": "^0.30.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Add TypeScript and Next config**

Create `apps/web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `apps/web/next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true
};

export default nextConfig;
```

Create `apps/web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node" },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") }
  }
});
```

- [ ] **Step 3: Minimal app shell**

Create `apps/web/app/globals.css` with a temporary import stub (tokens replaced in Task 2):

```css
:root {
  --green-900: #0b2e1f;
  --cream: #f5f2e9;
  --lime: #c6f24e;
  --ink: #0e1712;
  --muted: #5c6761;
  --font-display: "Archivo", "Inter", sans-serif;
  --font-body: "Inter", sans-serif;
}
* { box-sizing: border-box; margin: 0; }
body {
  font-family: var(--font-body);
  color: var(--ink);
  background: #fff;
  line-height: 1.6;
}
```

Create `apps/web/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Parkwise",
  description: "Institutional-grade parking assets across Europe."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Create `apps/web/app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main style={{ padding: 48 }}>
      <h1 style={{ fontFamily: "var(--font-display)" }}>Parkwise</h1>
      <p>Investor platform scaffold.</p>
    </main>
  );
}
```

Create `apps/web/app/api/health/route.ts`:

```ts
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ ok: true });
}
```

Create `apps/web/.env.example`:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
DATABASE_URL=
DEMO_MODE=true
OPS_INBOX_EMAIL=ops@parkwise.eu
```

- [ ] **Step 4: Root README dual-run instructions**

Create or update `README.md` at repo root:

```markdown
# Parkwise

## Legacy static demo

```bash
python3 -m http.server 8765
# open http://127.0.0.1:8765/
```

## Investor platform app (Plan 1+)

```bash
cd apps/web
cp .env.example .env.local   # fill Clerk + DATABASE_URL
npm install
npm run dev
# open http://localhost:3000
```
```

- [ ] **Step 5: Install and verify**

Run:

```bash
cd apps/web && npm install && npm run build
```

Expected: build succeeds.

Run:

```bash
cd apps/web && npm run dev
```

In another shell:

```bash
curl -s http://127.0.0.1:3000/api/health
```

Expected: `{"ok":true}`

- [ ] **Step 6: Commit**

```bash
git add apps/web README.md
git commit -m "scaffold apps/web Next.js package with health route"
```

---

### Task 2: Port design tokens and shared chrome

**Files:**
- Modify: `apps/web/app/globals.css`
- Create: `apps/web/components/demo-banner.tsx`
- Create: `apps/web/components/site-header.tsx`
- Create: `apps/web/components/site-footer.tsx`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: Task 1 app shell
- Produces: `DemoBanner`, `SiteHeader`, `SiteFooter`; layout wraps all pages; home shows Parkwise hero kicker + disclaimer

- [ ] **Step 1: Port CSS variables from `css/style.css`**

Copy the `:root` token block from `/css/style.css` (palette, fonts, radii, shadows, `--container`, `--gutter`, `--section`, `--header-h`) into `apps/web/app/globals.css`, plus base reset, `.container`, `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-sm`, `.kicker`, `.lead`, `.brand`, `.brand-mark`, `.brand-name`, `.site-header`, `.nav`, `.nav-links`, `.site-footer`, and disclaimer `.risk-line` rules needed for chrome. Load Google fonts in `app/layout.tsx` `<head>` the same way as `index.html`.

Keep values identical to the static site; do not invent a new palette.

- [ ] **Step 2: Demo banner component**

Create `apps/web/components/demo-banner.tsx`:

```tsx
export function DemoBanner() {
  if (process.env.DEMO_MODE !== "true") return null;
  return (
    <div
      role="status"
      style={{
        background: "var(--orange, #e8613c)",
        color: "#fff",
        textAlign: "center",
        fontSize: 13,
        fontWeight: 600,
        padding: "8px 16px"
      }}
    >
      Demonstration environment — not live offerings.
    </div>
  );
}
```

- [ ] **Step 3: Header and footer**

Create `apps/web/components/site-header.tsx` with links to `/`, `/opportunities`, `/how-it-works`, `/why-parking`, `/about`, Clerk `SignInButton` / `UserButton` placeholders as plain links `/sign-in` and `/portal` for now (Clerk wired in Task 4). Include brand mark `P` + `Parkwise`.

Create `apps/web/components/site-footer.tsx` with the same footer columns as `index.html` (Platform, Investors, Legal) and `contact@parkwise.eu`, plus the yield disclaimer paragraph used site-wide.

- [ ] **Step 4: Wire layout and home**

Update `layout.tsx` to render `DemoBanner`, `SiteHeader`, `{children}`, `SiteFooter`.

Replace `page.tsx` with a minimal marketing hero: brand-forward `Parkwise` name, headline from current home (“Own the spaces cities can’t function without.”), one lead, CTAs to `/opportunities` and `/how-it-works`, and the risk line. Stub `/how-it-works` etc. as simple pages that say “Coming in Plan 1 marketing parity” only if linked — or create thin placeholder routes so links do not 404:

- `app/how-it-works/page.tsx`
- `app/why-parking/page.tsx`
- `app/about/page.tsx`
- `app/documents/page.tsx`

Each placeholder: `page-hero` title + lead copied from the matching static HTML `<title>` / first lead paragraph.

- [ ] **Step 5: Visual verify**

Run `npm run dev`, open `/` at 1440 and 360 widths.

Expected: demo banner when `DEMO_MODE=true`, header/footer present, no horizontal overflow, fonts loaded.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "port Parkwise chrome and design tokens into apps/web"
```

---

### Task 3: Drizzle schema for investors and assets

**Files:**
- Create: `apps/web/lib/db/schema.ts`
- Create: `apps/web/lib/db/client.ts`
- Create: `apps/web/lib/db/index.ts`
- Create: `apps/web/drizzle.config.ts`
- Create: `apps/web/tests/format.test.ts`
- Create: `apps/web/lib/format.ts`

**Interfaces:**
- Consumes: `DATABASE_URL`
- Produces:
  - tables `investors`, `assets`, `audit_events` (Plan 1 subset)
  - `db` export from `lib/db/client.ts`
  - `formatEur(n: number): string` and `formatYieldPct(n: string | number): string`

- [ ] **Step 1: Write failing format tests**

Create `apps/web/lib/format.ts`:

```ts
export function formatEur(n: number): string {
  throw new Error("not implemented");
}

export function formatYieldPct(n: string | number): string {
  throw new Error("not implemented");
}
```

Create `apps/web/tests/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatEur, formatYieldPct } from "@/lib/format";

describe("formatEur", () => {
  it("formats whole euros with en-IE currency", () => {
    expect(formatEur(9900)).toBe("€9,900");
  });
});

describe("formatYieldPct", () => {
  it("formats one decimal with percent sign", () => {
    expect(formatYieldPct(7.7)).toBe("7.7%");
    expect(formatYieldPct("8.40")).toBe("8.4%");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd apps/web && npm test
```

Expected: FAIL `not implemented`

- [ ] **Step 3: Implement format helpers**

```ts
export function formatEur(n: number): string {
  return n.toLocaleString("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  });
}

export function formatYieldPct(n: string | number): string {
  const value = typeof n === "string" ? Number(n) : n;
  return `${value.toFixed(1)}%`;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/web && npm test
```

Expected: PASS

- [ ] **Step 5: Schema and DB client**

Create `apps/web/lib/db/schema.ts`:

```ts
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  jsonb,
  pgEnum,
  uniqueIndex
} from "drizzle-orm/pg-core";

export const onboardingStatusEnum = pgEnum("onboarding_status", ["started", "completed"]);
export const accountStatusEnum = pgEnum("account_status", ["active", "suspended"]);
export const assetStatusEnum = pgEnum("asset_status", ["draft", "published", "closed"]);

export const investors = pgTable("investors", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email").notNull(),
  fullName: text("full_name").notNull().default(""),
  country: text("country").notNull().default(""),
  phone: text("phone"),
  onboardingStatus: onboardingStatusEnum("onboarding_status").notNull().default("started"),
  accountStatus: accountStatusEnum("account_status").notNull().default("active"),
  eligibilityAnswers: jsonb("eligibility_answers").$type<Record<string, unknown>>().notNull().default({}),
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  riskAcceptedAt: timestamp("risk_accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    operator: text("operator").notNull(),
    city: text("city").notNull(),
    district: text("district").notNull(),
    country: text("country").notNull(),
    targetYieldPct: numeric("target_yield_pct", { precision: 5, scale: 2 }).notNull(),
    tier: text("tier").notNull(),
    minTicketEur: integer("min_ticket_eur").notNull(),
    spaces: integer("spaces").notNull(),
    occupancyPct: numeric("occupancy_pct", { precision: 5, scale: 2 }).notNull(),
    leaseLabel: text("lease_label").notNull(),
    blurb: text("blurb").notNull(),
    status: assetStatusEnum("status").notNull().default("draft"),
    advisoryCapacityEur: integer("advisory_capacity_eur"),
    artVariant: integer("art_variant").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex("assets_slug_uidx").on(t.slug)]
);

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorClerkId: text("actor_clerk_id").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
```

Create `apps/web/lib/db/client.ts`:

```ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export function createDb(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

export const db = createDb();
```

Create `apps/web/lib/db/index.ts`:

```ts
export * from "./schema";
export { db, createDb } from "./client";
```

Create `apps/web/drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! }
});
```

- [ ] **Step 6: Generate migration and apply**

```bash
cd apps/web && npm run db:generate && npm run db:migrate
```

Expected: migration SQL created under `apps/web/drizzle/` and applied to Neon (requires `DATABASE_URL` in `.env.local`).

If Neon is unavailable in CI, commit the generated SQL and document that migrate is required locally/staging.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "add Drizzle schema for investors, assets, and audit events"
```

---

### Task 4: Clerk auth, investor sync, role helpers

**Files:**
- Create: `apps/web/middleware.ts`
- Create: `apps/web/lib/auth/roles.ts`
- Create: `apps/web/lib/auth/investor.ts`
- Create: `apps/web/tests/roles.test.ts`
- Create: `apps/web/app/sign-in/[[...sign-in]]/page.tsx`
- Create: `apps/web/app/sign-up/[[...sign-up]]/page.tsx`
- Create: `apps/web/app/portal/page.tsx`
- Create: `apps/web/app/admin/page.tsx`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/components/site-header.tsx`

**Interfaces:**
- Consumes: `investors` table; Clerk env keys
- Produces:
  - `isAdmin(user: { publicMetadata?: Record<string, unknown> } | null): boolean`
  - `requireAdmin(): Promise<void>` (throws / redirects)
  - `ensureInvestor(): Promise<{ id: string; clerkUserId: string; email: string; onboardingStatus: "started" | "completed"; accountStatus: "active" | "suspended" }>`
  - Protected `/portal` (signed-in) and `/admin` (admin only)

- [ ] **Step 1: Failing role test**

Create `apps/web/lib/auth/roles.ts`:

```ts
export function isAdmin(user: { publicMetadata?: Record<string, unknown> } | null | undefined): boolean {
  return false;
}
```

Create `apps/web/tests/roles.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isAdmin } from "@/lib/auth/roles";

describe("isAdmin", () => {
  it("is true only when publicMetadata.role is admin", () => {
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin({ publicMetadata: {} })).toBe(false);
    expect(isAdmin({ publicMetadata: { role: "investor" } })).toBe(false);
    expect(isAdmin({ publicMetadata: { role: "admin" } })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — FAIL**

```bash
cd apps/web && npm test -- tests/roles.test.ts
```

Expected: FAIL on admin case

- [ ] **Step 3: Implement isAdmin**

```ts
export function isAdmin(user: { publicMetadata?: Record<string, unknown> } | null | undefined): boolean {
  return user?.publicMetadata?.role === "admin";
}
```

- [ ] **Step 4: Run test — PASS**

```bash
cd apps/web && npm test -- tests/roles.test.ts
```

Expected: PASS

- [ ] **Step 5: Investor ensure helper**

Create `apps/web/lib/auth/investor.ts`:

```ts
import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db, investors } from "@/lib/db";

export async function ensureInvestor() {
  const { userId } = await auth();
  if (!userId) throw new Error("UNAUTHENTICATED");

  const user = await currentUser();
  if (!user) throw new Error("UNAUTHENTICATED");

  const email =
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    "";

  const existing = await db.query.investors.findFirst({
    where: eq(investors.clerkUserId, userId)
  });
  if (existing) return existing;

  const [created] = await db
    .insert(investors)
    .values({
      clerkUserId: userId,
      email,
      fullName: [user.firstName, user.lastName].filter(Boolean).join(" ")
    })
    .returning();

  await db.insert(auditEvents).values({
    actorClerkId: userId,
    action: "investor.created",
    entityType: "investor",
    entityId: created.id,
    payload: { email }
  });

  return created;
}
```

Import `auditEvents` from `@/lib/db` at the top of this file.

Also export:

```ts
export async function requireAdmin() {
  const user = await currentUser();
  if (!isAdmin(user)) {
    throw new Error("FORBIDDEN");
  }
}
```

(import `isAdmin` from `./roles`).

Enable Drizzle relational queries by ensuring `db` is created with `schema` (already in Task 3). If `db.query.investors` is unavailable, use `db.select().from(investors).where(eq(...)).limit(1)` instead — pick one style and use it consistently.

- [ ] **Step 6: Clerk provider + middleware + routes**

Wrap `layout.tsx` children with `ClerkProvider` from `@clerk/nextjs`.

Create `apps/web/middleware.ts`:

```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtected = createRouteMatcher(["/portal(.*)", "/admin(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/", "/(api|trpc)(.*)"]
};
```

Create sign-in / sign-up pages using Clerk `<SignIn />` / `<SignUp />`.

Create `app/portal/page.tsx`: server component that calls `ensureInvestor()` and renders “Welcome, {email}” plus onboarding status and a note “Express interest arrives in Plan 2”.

Create `app/admin/page.tsx`: server component that calls `requireAdmin()` inside try/catch and `redirect("/")` on `FORBIDDEN`; on success render “Admin console” with links to future `/admin/assets` (placeholder heading only).

Update header to use Clerk `SignedIn` / `SignedOut`, `SignInButton`, `UserButton`.

- [ ] **Step 7: Manual auth verify**

With Clerk keys in `.env.local`:

1. Open `/sign-up`, create a user.
2. Visit `/portal` — investor row created; welcome shows.
3. Without admin metadata, `/admin` redirects home.
4. In Clerk dashboard set `publicMetadata: { "role": "admin" }` on the user; `/admin` loads.

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "integrate Clerk auth, investor sync, and admin role gate"
```

---

### Task 5: Seed assets from static catalogue

**Files:**
- Create: `apps/web/scripts/export-static-assets.mjs`
- Create: `apps/web/scripts/seed-data.json` (generated)
- Create: `apps/web/scripts/seed-assets.ts`
- Modify: `apps/web/package.json` (seed script already defined)

**Interfaces:**
- Consumes: repo-root `js/data.js` `PARKWISE_ASSETS` shape (`id`, `name`, `operator`, `city`, `district`, `country`, `yield`, `tier`, `from`, `spaces`, `occupancy`, `lease`, `blurb`, `art`)
- Produces: upserted `assets` rows with `status: "published"`, `slug = id`

- [ ] **Step 1: Export script**

Create `apps/web/scripts/export-static-assets.mjs`:

```js
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const source = fs.readFileSync(path.join(root, "js/data.js"), "utf8");
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox);
const assets = sandbox.window.PARKWISE_ASSETS;
if (!Array.isArray(assets) || assets.length < 1) {
  throw new Error("PARKWISE_ASSETS missing");
}
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "seed-data.json");
fs.writeFileSync(out, JSON.stringify(assets, null, 2));
console.log(`Wrote ${assets.length} assets to ${out}`);
```

Run:

```bash
cd apps/web && node scripts/export-static-assets.mjs
```

Expected: `Wrote N assets` and `scripts/seed-data.json` exists.

- [ ] **Step 2: Seed script**

Create `apps/web/scripts/seed-assets.ts`:

```ts
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createDb, assets } from "../lib/db";

type StaticAsset = {
  id: string;
  name: string;
  operator: string;
  city: string;
  district: string;
  country: string;
  yield: number;
  tier: string;
  from: number;
  spaces: number;
  occupancy: number;
  lease: string;
  blurb: string;
  art: number;
};

async function main() {
  const file = path.join(__dirname, "seed-data.json");
  const rows = JSON.parse(fs.readFileSync(file, "utf8")) as StaticAsset[];
  const db = createDb();

  for (const row of rows) {
    await db
      .insert(assets)
      .values({
        slug: row.id,
        name: row.name,
        operator: row.operator,
        city: row.city,
        district: row.district,
        country: row.country,
        targetYieldPct: row.yield.toFixed(2),
        tier: row.tier,
        minTicketEur: row.from,
        spaces: row.spaces,
        occupancyPct: row.occupancy.toFixed(2),
        leaseLabel: row.lease,
        blurb: row.blurb,
        status: "published",
        artVariant: row.art
      })
      .onConflictDoUpdate({
        target: assets.slug,
        set: {
          name: row.name,
          operator: row.operator,
          city: row.city,
          district: row.district,
          country: row.country,
          targetYieldPct: row.yield.toFixed(2),
          tier: row.tier,
          minTicketEur: row.from,
          spaces: row.spaces,
          occupancyPct: row.occupancy.toFixed(2),
          leaseLabel: row.lease,
          blurb: row.blurb,
          status: "published",
          artVariant: row.art,
          updatedAt: new Date()
        }
      });
  }
  console.log(`Seeded ${rows.length} assets`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Add dependency `dotenv` if needed: `npm install dotenv`.

Note: `onConflictDoUpdate` requires the unique index on `slug` from Task 3. If Drizzle needs `target: assets.slug`, keep as written; adjust to unique index name if generate step requires it.

- [ ] **Step 3: Run seed**

```bash
cd apps/web && node scripts/export-static-assets.mjs && npm run db:seed
```

Expected: `Seeded N assets`

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "add asset seed pipeline from static PARKWISE_ASSETS"
```

---

### Task 6: Public opportunities catalogue UI

**Files:**
- Create: `apps/web/components/asset-card.tsx`
- Create: `apps/web/lib/assets.ts`
- Modify: `apps/web/app/opportunities/page.tsx`
- Create: `apps/web/app/opportunities/[slug]/page.tsx`
- Create: `apps/web/tests/assets-query.test.ts` (optional pure filter helper)

**Interfaces:**
- Consumes: `assets` table published rows; `formatEur`, `formatYieldPct`
- Produces:
  - `listPublishedAssets(): Promise<Asset[]>`
  - `getPublishedAssetBySlug(slug: string): Promise<Asset | null>`
  - Catalogue + detail pages with disclaimer

- [ ] **Step 1: Data access helpers**

Create `apps/web/lib/assets.ts`:

```ts
import { and, eq } from "drizzle-orm";
import { db, assets } from "@/lib/db";

export async function listPublishedAssets() {
  return db
    .select()
    .from(assets)
    .where(eq(assets.status, "published"))
    .orderBy(assets.name);
}

export async function getPublishedAssetBySlug(slug: string) {
  const rows = await db
    .select()
    .from(assets)
    .where(and(eq(assets.slug, slug), eq(assets.status, "published")))
    .limit(1);
  return rows[0] ?? null;
}
```

Add `orderBy` import from `drizzle-orm` if required: `import { and, eq, asc } from "drizzle-orm"` and `.orderBy(asc(assets.name))`.

- [ ] **Step 2: Asset card**

Create `apps/web/components/asset-card.tsx` displaying name, city/country, tier, `formatYieldPct(targetYieldPct)` labeled **target yield**, `formatEur(minTicketEur)` as from-price, link to `/opportunities/[slug]`. Include visible microcopy under yield: “Contractual target, not a guarantee.”

- [ ] **Step 3: Catalogue page**

`app/opportunities/page.tsx`: server component calling `listPublishedAssets()`, grid of `AssetCard`, page hero copy from static `opportunities.html`.

- [ ] **Step 4: Detail page**

`app/opportunities/[slug]/page.tsx`: load asset; `notFound()` if missing; show blurb, facts (spaces, occupancy, lease, operator), target yield, min ticket, risk line. Primary button label: **Express interest** linking to `/sign-in` if signed out, or `/portal` with query `?intent=interest&asset=slug` if signed in (handler implemented in Plan 2 — for Plan 1 the portal shows “Interest flow coming next”).

- [ ] **Step 5: Verify**

```bash
cd apps/web && npm run build && npm test
```

Expected: build OK, unit tests pass.

Manual: `/opportunities` lists seeded assets; detail pages render; yields never say “guaranteed”.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "ship public opportunities catalogue from Postgres"
```

---

### Task 7: Plan 1 hardening checklist

**Files:**
- Modify: `README.md`
- Create: `apps/web/docs/plan1-verify.md`

**Interfaces:**
- Consumes: Tasks 1–6
- Produces: verification checklist completed before Plan 2 starts

- [ ] **Step 1: Write verify doc**

Create `apps/web/docs/plan1-verify.md` with this checklist (tick when done):

```markdown
# Plan 1 verification

- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] `/api/health` returns ok
- [ ] `DEMO_MODE=true` shows banner
- [ ] Sign-up → `/portal` creates investor row
- [ ] Non-admin `/admin` redirects
- [ ] Admin metadata allows `/admin`
- [ ] `/opportunities` lists seeded published assets
- [ ] Asset detail shows target yield disclaimer
- [ ] Root static demo still serves via `python3 -m http.server`
```

- [ ] **Step 2: Run the checklist on staging/local and tick items**

- [ ] **Step 3: Commit**

```bash
git add README.md apps/web/docs/plan1-verify.md
git commit -m "document Plan 1 verification checklist"
```

---

## Follow-on plans (not in this file)

**Plan 2 — Onboarding + Interests:** eligibility questionnaire, T&Cs acceptance, express-interest mutations, admin interest queue, Resend emails, interest status machine.

**Plan 3 — Portfolio + Documents + Hardening:** holdings on confirm, R2 document vault, rate limits, Playwright E2E, production launch checklist.

---

## Spec coverage (Plan 1)

| Spec area | Task |
|---|---|
| Next.js scaffold / Vercel-ready app | Task 1 |
| Design tokens / marketing chrome | Task 2 |
| `DEMO_MODE` banner | Task 2 |
| Investors + assets + audit schema | Task 3 |
| Clerk auth + admin role | Task 4 |
| Seed from `js/data.js` | Task 5 |
| Public catalogue + detail | Task 6 |
| Dual-run static + app docs | Task 1, 7 |
| Express interest / holdings / R2 / Resend | Deferred to Plan 2–3 |
