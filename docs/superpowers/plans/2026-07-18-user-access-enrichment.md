# User Access Events & IP Enrichment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On every successful sign-in, record a durable access event with IP/UA, enrich it once (API → local MMDB), and show stacked ops person cards (profile → latest → history) scoped like Phase 1–3.

**Architecture:** New `user_access_events` table. Better Auth `databaseHooks.session.create.after` calls `recordAccessEvent`. Enrichment is in-process, non-blocking for auth success. Admin UIs load events via scoped loaders; shared `PersonAccessPanel` on investor detail, linked leads, and staff detail.

**Tech Stack:** Next.js 15, Better Auth, Drizzle, Postgres, Vitest; optional `maxmind` for local MMDB; outbound HTTPS for enrichment API.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-18-user-access-enrichment-design.md`
- Ops-only UI; admin English; investors never see access history
- Scope with `investorVisibleToStaff` / staff role checks; unscoped → throw `NOT_FOUND` → `notFound()`
- Sign-in must succeed even if insert/enrich fails
- Enrich once per event; never re-call API for the same row
- Do not commit secrets or MMDB binaries
- Commit with: `git -c user.email="parkwise@local" -c user.name="Parkwise"`
- Node via nvm: `/Users/mac/.nvm/versions/node/v22.23.1/bin` on PATH when running npm

## Out of scope

- Per-request tracking (sign-in / session create only)
- Investor-facing login history
- Retention purge jobs
- List-row “last: 🇫🇷” hints
- Client i18n (Phase 4)

## File Structure

```
apps/web/
  lib/db/schema.ts                         # userAccessEvents + enum
  drizzle/0008_*.sql                       # generated migration
  lib/access/ip.ts                         # parseClientIp, isPrivateIp
  lib/access/ua.ts                         # parseUserAgent
  lib/access/enrich-types.ts               # shared enrichment types
  lib/access/enrich-api.ts                 # fetch + map API payload
  lib/access/enrich-local.ts               # optional MMDB
  lib/access/enrich.ts                     # hybrid orchestrator
  lib/access/record.ts                     # insert + enrich
  lib/access/scope.ts                      # authUserVisibleToStaff helpers
  lib/access/admin-actions.ts              # list events / get investor detail
  lib/auth/auth.ts                         # session.create.after hook
  components/person-access-panel.tsx
  app/admin/investors/[investorId]/page.tsx
  app/admin/investors/page.tsx             # link rows to detail
  app/admin/leads/lead/[leadId]/page.tsx   # panel when linked
  app/admin/staff/[staffId]/page.tsx
  app/admin/staff/page.tsx                 # link to staff detail
  tests/access-ip.test.ts
  tests/access-ua.test.ts
  tests/access-enrich.test.ts
  tests/access-scope.test.ts
  docs/SETUP.md                            # env vars
  docs/plan-access-enrichment-verify.md
```

---

### Task 1: Schema — `user_access_events`

**Files:**
- Modify: `apps/web/lib/db/schema.ts`
- Generate: `apps/web/drizzle/0008_*.sql`, `apps/web/drizzle/meta/*`

**Interfaces:**
- Produces:
  - `enrichmentStatusEnum`: `pending` | `ok` | `partial` | `failed`
  - `enrichmentSourceEnum`: `api` | `local` | `none`
  - `userAccessEvents` table matching the spec columns
  - Index on `(auth_user_id, occurred_at)` (newest-first via `orderBy desc` in queries)

- [ ] **Step 1: Add enums + table to schema**

Add after `leadCallAttempts` (before `assets` / audit — keep with domain tables, before Better Auth re-export):

```ts
export const enrichmentStatusEnum = pgEnum("enrichment_status", [
  "pending",
  "ok",
  "partial",
  "failed"
]);

export const enrichmentSourceEnum = pgEnum("enrichment_source", [
  "api",
  "local",
  "none"
]);

export const userAccessEvents = pgTable(
  "user_access_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    authUserId: text("auth_user_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    uaBrowser: text("ua_browser"),
    uaOs: text("ua_os"),
    uaDevice: text("ua_device"),
    countryCode: text("country_code"),
    countryName: text("country_name"),
    region: text("region"),
    city: text("city"),
    timezone: text("timezone"),
    isp: text("isp"),
    org: text("org"),
    isProxy: boolean("is_proxy"),
    isVpn: boolean("is_vpn"),
    isDatacenter: boolean("is_datacenter"),
    enrichmentStatus: enrichmentStatusEnum("enrichment_status").notNull().default("pending"),
    enrichmentSource: enrichmentSourceEnum("enrichment_source").notNull().default("none"),
    enrichmentRaw: jsonb("enrichment_raw").$type<Record<string, unknown>>(),
    sessionId: text("session_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("user_access_events_user_occurred_idx").on(t.authUserId, t.occurredAt)]
);
```

Import `boolean` from `drizzle-orm/pg-core` if not already imported.

- [ ] **Step 2: Generate migration**

```bash
export PATH="/Users/mac/.nvm/versions/node/v22.23.1/bin:$PATH"
cd apps/web && npm run db:generate
```

Expected: new `drizzle/0008_*.sql` with `user_access_events` + enums.

- [ ] **Step 3: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/lib/db/schema.ts apps/web/drizzle
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
add user_access_events schema for IP enrichment history

EOF
)"
```

---

### Task 2: IP helpers (TDD)

> **Superseded (2026-07-22):** the `parseClientIp` API specified below was removed. Client-IP resolution now relies on Better Auth's built-in header handling via `advanced.ipAddress.trustedProxies` in `apps/web/lib/auth/auth.ts` (comma-separated `TRUSTED_PROXIES` env, default `127.0.0.1,::1` — see `apps/web/.env.example`). The `parseClientIp` tests and implementation in this task are kept for history only; `isPrivateIp` is still live.

**Files:**
- Create: `apps/web/lib/access/ip.ts`
- Test: `apps/web/tests/access-ip.test.ts`

**Interfaces:**
- Produces:
  - `parseClientIp(headers: Headers | { get(name: string): string | null }): string | null`
  - `isPrivateIp(ip: string): boolean`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { isPrivateIp, parseClientIp } from "@/lib/access/ip";

describe("parseClientIp", () => {
  it("takes leftmost public hop from x-forwarded-for", () => {
    const h = new Headers({
      "x-forwarded-for": "203.0.113.10, 10.0.0.1"
    });
    expect(parseClientIp(h)).toBe("203.0.113.10");
  });

  it("falls back to x-real-ip", () => {
    const h = new Headers({ "x-real-ip": "198.51.100.2" });
    expect(parseClientIp(h)).toBe("198.51.100.2");
  });

  it("returns null when missing", () => {
    expect(parseClientIp(new Headers())).toBeNull();
  });
});

describe("isPrivateIp", () => {
  it("detects loopback and RFC1918", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("10.0.0.5")).toBe(true);
    expect(isPrivateIp("192.168.1.1")).toBe(true);
    expect(isPrivateIp("203.0.113.10")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
export PATH="/Users/mac/.nvm/versions/node/v22.23.1/bin:$PATH"
cd apps/web && npx vitest run tests/access-ip.test.ts
```

Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// apps/web/lib/access/ip.ts
type HeaderLike = { get(name: string): string | null };

export function parseClientIp(headers: HeaderLike): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  return null;
}

export function isPrivateIp(ip: string): boolean {
  if (ip === "::1" || ip.startsWith("127.")) return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;
  return false;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/web && npx vitest run tests/access-ip.test.ts
```

- [ ] **Step 5: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/lib/access/ip.ts apps/web/tests/access-ip.test.ts
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
add client IP header parsing helpers

EOF
)"
```

---

### Task 3: UA parse helpers (TDD)

**Files:**
- Create: `apps/web/lib/access/ua.ts`
- Test: `apps/web/tests/access-ua.test.ts`

**Interfaces:**
- Produces:
  - `parseUserAgent(ua: string | null | undefined): { browser: string | null; os: string | null; device: string | null }`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { parseUserAgent } from "@/lib/access/ua";

describe("parseUserAgent", () => {
  it("returns nulls for empty", () => {
    expect(parseUserAgent("")).toEqual({
      browser: null,
      os: null,
      device: null
    });
  });

  it("parses Chrome on macOS", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    const parsed = parseUserAgent(ua);
    expect(parsed.browser).toMatch(/Chrome/i);
    expect(parsed.os).toMatch(/Mac/i);
    expect(parsed.device).toBe("desktop");
  });

  it("marks iPhone as mobile", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(parseUserAgent(ua).device).toBe("mobile");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/web && npx vitest run tests/access-ua.test.ts
```

- [ ] **Step 3: Implement minimal parser** (no new dependency — regex heuristics)

```ts
// apps/web/lib/access/ua.ts
export function parseUserAgent(ua: string | null | undefined): {
  browser: string | null;
  os: string | null;
  device: string | null;
} {
  if (!ua || !ua.trim()) {
    return { browser: null, os: null, device: null };
  }
  const s = ua;

  let browser: string | null = null;
  if (/Edg\//.test(s)) browser = "Edge";
  else if (/Chrome\//.test(s) && !/Chromium/.test(s)) browser = "Chrome";
  else if (/Firefox\//.test(s)) browser = "Firefox";
  else if (/Safari\//.test(s) && !/Chrome\//.test(s)) browser = "Safari";

  let os: string | null = null;
  if (/Windows/i.test(s)) os = "Windows";
  else if (/Android/i.test(s)) os = "Android";
  else if (/iPhone|iPad|iOS/i.test(s)) os = "iOS";
  else if (/Mac OS X|Macintosh/i.test(s)) os = "macOS";
  else if (/Linux/i.test(s)) os = "Linux";

  let device: string | null = "desktop";
  if (/Mobile|Android|iPhone/i.test(s)) device = "mobile";
  else if (/iPad|Tablet/i.test(s)) device = "tablet";

  return { browser, os, device };
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/lib/access/ua.ts apps/web/tests/access-ua.test.ts
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
add user-agent summary parser

EOF
)"
```

---

### Task 4: Enrichment types + hybrid enrich (TDD)

**Files:**
- Create: `apps/web/lib/access/enrich-types.ts`
- Create: `apps/web/lib/access/enrich-api.ts`
- Create: `apps/web/lib/access/enrich-local.ts`
- Create: `apps/web/lib/access/enrich.ts`
- Test: `apps/web/tests/access-enrich.test.ts`

**Interfaces:**
- Produces:
  - `type EnrichmentFields = { countryCode, countryName, region, city, timezone, isp, org, isProxy, isVpn, isDatacenter }` (all optional/nullable)
  - `type EnrichmentResult = EnrichmentFields & { status: 'ok'|'partial'|'failed'; source: 'api'|'local'|'none'; raw?: Record<string, unknown> }`
  - `mapApiPayload(body: unknown): EnrichmentFields` — maps common keys (`country_code` / `countryCode` / `country`, `city`, `region`, `timezone`, `org`/`isp`, `privacy.vpn` / `proxy` / `hosting`)
  - `enrichFromApi(ip: string, opts?: { fetchImpl?, timeoutMs? }): Promise<EnrichmentResult | null>`
  - `enrichFromLocal(ip: string): Promise<EnrichmentResult | null>` — null if no MMDB / private; v1 may return null always if `maxmind` not wired yet, but must read `IP_ENRICHMENT_MMDB_PATH` and no-op safely
  - `enrichIp(ip: string | null): Promise<EnrichmentResult>` — private → partial/none; else API then local

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { mapApiPayload, enrichIp } from "@/lib/access/enrich";
import { isPrivateIp } from "@/lib/access/ip";

describe("mapApiPayload", () => {
  it("maps ipinfo-style privacy flags", () => {
    const fields = mapApiPayload({
      ip: "203.0.113.10",
      city: "Paris",
      region: "Île-de-France",
      country: "FR",
      country_name: "France",
      timezone: "Europe/Paris",
      org: "AS3215 Orange",
      privacy: { vpn: true, proxy: false, hosting: false }
    });
    expect(fields.countryCode).toBe("FR");
    expect(fields.city).toBe("Paris");
    expect(fields.isVpn).toBe(true);
    expect(fields.isProxy).toBe(false);
  });
});

describe("enrichIp", () => {
  it("marks private IPs partial without calling API", async () => {
    const fetchImpl = vi.fn();
    const result = await enrichIp("127.0.0.1", { fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.status).toBe("partial");
    expect(result.source).toBe("none");
  });

  it("uses API result when fetch succeeds", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          city: "Berlin",
          country: "DE",
          country_name: "Germany",
          org: "Example ISP"
        }),
        { status: 200 }
      )
    );
    process.env.IP_ENRICHMENT_API_URL = "https://example.test/json/{ip}";
    process.env.IP_ENRICHMENT_API_KEY = "test-key";
    const result = await enrichIp("203.0.113.10", { fetchImpl, timeoutMs: 500 });
    expect(result.source).toBe("api");
    expect(result.city).toBe("Berlin");
    expect(result.status).toBe("ok");
  });
});
```

Re-export `mapApiPayload` and `enrichIp` from `enrich.ts`. Clear env in `afterEach` if needed.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement modules**

`enrich-api.ts`: replace `{ip}` in `IP_ENRICHMENT_API_URL`; send `Authorization: Bearer ${IP_ENRICHMENT_API_KEY}` when key set; AbortSignal timeout default 2000ms; return null on non-OK / throw.

`enrich-local.ts`: if `IP_ENRICHMENT_MMDB_PATH` unset or file missing → `null`. Optional: add `maxmind` dependency and open City DB for country/city only (VPN flags stay null → caller marks `partial` if only geo filled). If skipping `maxmind` in v1, document stub returning `null` and still satisfy hybrid (API-only until MMDB wired).

`enrich.ts`:

```ts
export async function enrichIp(
  ip: string | null,
  opts?: { fetchImpl?: typeof fetch; timeoutMs?: number }
): Promise<EnrichmentResult> {
  if (!ip || isPrivateIp(ip)) {
    return { status: "partial", source: "none" };
  }
  const api = await enrichFromApi(ip, opts);
  if (api && (api.countryCode || api.city)) return api;
  const local = await enrichFromLocal(ip);
  if (local && (local.countryCode || local.city)) return local;
  return { status: "failed", source: "none", raw: api?.raw ?? local?.raw };
}
```

Status `ok` when country or city present and no hard failure; `partial` when some fields only; treat VPN-only without geo as `partial`.

- [ ] **Step 4: Run — expect PASS**

```bash
cd apps/web && npx vitest run tests/access-enrich.test.ts
```

- [ ] **Step 5: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/lib/access apps/web/tests/access-enrich.test.ts apps/web/package.json apps/web/package-lock.json
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
add hybrid IP enrichment (API then local)

EOF
)"
```

---

### Task 5: `recordAccessEvent` + Better Auth hook

**Files:**
- Create: `apps/web/lib/access/record.ts`
- Modify: `apps/web/lib/auth/auth.ts`

**Interfaces:**
- Produces:
  - `recordAccessEvent(input: { authUserId: string; ipAddress: string | null; userAgent: string | null; sessionId?: string | null }): Promise<void>`
  - Never throws to caller (catch internally, `console.error`)
  - Inserts pending row, parses UA, calls `enrichIp`, updates row with enrichment fields + status/source/raw

- [ ] **Step 1: Implement `recordAccessEvent`**

```ts
// apps/web/lib/access/record.ts
import { eq } from "drizzle-orm";
import { db, userAccessEvents } from "@/lib/db";
import { enrichIp } from "@/lib/access/enrich";
import { parseUserAgent } from "@/lib/access/ua";

export async function recordAccessEvent(input: {
  authUserId: string;
  ipAddress: string | null;
  userAgent: string | null;
  sessionId?: string | null;
}): Promise<void> {
  try {
    const ua = parseUserAgent(input.userAgent);
    const [row] = await db
      .insert(userAccessEvents)
      .values({
        authUserId: input.authUserId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        uaBrowser: ua.browser,
        uaOs: ua.os,
        uaDevice: ua.device,
        sessionId: input.sessionId ?? null,
        enrichmentStatus: "pending",
        enrichmentSource: "none"
      })
      .returning({ id: userAccessEvents.id });

    if (!row) return;

    const enriched = await enrichIp(input.ipAddress);
    await db
      .update(userAccessEvents)
      .set({
        countryCode: enriched.countryCode ?? null,
        countryName: enriched.countryName ?? null,
        region: enriched.region ?? null,
        city: enriched.city ?? null,
        timezone: enriched.timezone ?? null,
        isp: enriched.isp ?? null,
        org: enriched.org ?? null,
        isProxy: enriched.isProxy ?? null,
        isVpn: enriched.isVpn ?? null,
        isDatacenter: enriched.isDatacenter ?? null,
        enrichmentStatus: enriched.status,
        enrichmentSource: enriched.source,
        enrichmentRaw: enriched.raw ?? null
      })
      .where(eq(userAccessEvents.id, row.id));
  } catch (error) {
    console.error("[access] recordAccessEvent failed", error);
  }
}
```

Ensure `db` re-exports `userAccessEvents` from `lib/db` index (same pattern as other tables).

- [ ] **Step 2: Hook Better Auth**

```ts
// apps/web/lib/auth/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { recordAccessEvent } from "@/lib/access/record";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema
  }),
  emailAndPassword: { enabled: true },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          await recordAccessEvent({
            authUserId: session.userId,
            ipAddress: session.ipAddress ?? null,
            userAgent: session.userAgent ?? null,
            sessionId: session.id
          });
        }
      }
    }
  }
});
```

If `session.ipAddress` is often empty behind Coolify, also accept headers in a follow-up — for v1 rely on Better Auth’s built-in IP capture; document that proxy must forward `X-Forwarded-For`.

- [ ] **Step 3: Typecheck / build smoke**

```bash
cd apps/web && npx tsc --noEmit
```

Fix types if Better Auth session shape differs (`userId` vs nested).

- [ ] **Step 4: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/lib/access/record.ts apps/web/lib/auth/auth.ts apps/web/lib/db
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
record access events on Better Auth session create

EOF
)"
```

---

### Task 6: Access visibility helpers (TDD)

**Files:**
- Create: `apps/web/lib/access/scope.ts`
- Test: `apps/web/tests/access-scope.test.ts`

**Interfaces:**
- Produces:
  - `authUserVisibleToStaff(input: { role: StaffRole; staffId: string; target: { kind: 'investor'; assignedAgentId: string | null } | { kind: 'staff' } }): boolean`
  - Investor: reuse same rules as `investorVisibleToStaff`
  - Staff target: `true` only if `role === 'super_admin'`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { authUserVisibleToStaff } from "@/lib/access/scope";

describe("authUserVisibleToStaff", () => {
  it("allows agent for assigned investor only", () => {
    expect(
      authUserVisibleToStaff({
        role: "agent",
        staffId: "a1",
        target: { kind: "investor", assignedAgentId: "a1" }
      })
    ).toBe(true);
    expect(
      authUserVisibleToStaff({
        role: "agent",
        staffId: "a1",
        target: { kind: "investor", assignedAgentId: "a2" }
      })
    ).toBe(false);
  });

  it("blocks agents from staff targets", () => {
    expect(
      authUserVisibleToStaff({
        role: "agent",
        staffId: "a1",
        target: { kind: "staff" }
      })
    ).toBe(false);
  });

  it("allows super_admin for staff and any investor", () => {
    expect(
      authUserVisibleToStaff({
        role: "super_admin",
        staffId: "s1",
        target: { kind: "staff" }
      })
    ).toBe(true);
  });
});
```

- [ ] **Step 2–4: Implement via `investorVisibleToStaff` for investor kind; PASS; commit**

```bash
git commit -m "$(cat <<'EOF'
add access-event visibility helpers for staff scoping

EOF
)"
```

---

### Task 7: Admin loaders

**Files:**
- Create: `apps/web/lib/access/admin-actions.ts`
- Modify: `apps/web/lib/investors/admin-actions.ts` (optional `getInvestorDetailForStaff`)

**Interfaces:**
- Produces:
  - `type AccessEventRow` — fields needed by UI (id, occurredAt, ipAddress, ua*, geo*, isp, org, flags, enrichmentStatus)
  - `listAccessEventsForAuthUser(authUserId: string): Promise<AccessEventRow[]>` — `requireStaff`, resolve target investor by `authUserId` OR staff profile by `authUserId`; if neither → `NOT_FOUND`; if not visible → `NOT_FOUND`; order `occurredAt desc`
  - `getInvestorDetailForStaff(investorId: string): Promise<InvestorDetail>` — profile fields + `authUserId`; scoped; else `NOT_FOUND`

- [ ] **Step 1: Implement loaders** using `requireStaff`, `db`, `authUserVisibleToStaff`

Throw `new Error("NOT_FOUND")` or `FORBIDDEN` consistently with leads.

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
add scoped admin loaders for access events and investor detail

EOF
)"
```

---

### Task 8: `PersonAccessPanel` + investor detail page

**Files:**
- Create: `apps/web/components/person-access-panel.tsx`
- Create: `apps/web/app/admin/investors/[investorId]/page.tsx`
- Modify: `apps/web/app/admin/investors/page.tsx` — link name/email to detail

**Interfaces:**
- Consumes: `AccessEventRow[]`
- Produces: stacked UI — Latest access + Access history; country flag via emoji from `countryCode` (helper `flagEmoji(code: string): string` using regional indicator symbols)

- [ ] **Step 1: Build panel** (server-friendly presentational component)

Show IP, UA summary, city/region/country, ISP/org, VPN/proxy/datacenter labels, enrichment status when not `ok`. Empty: “No access events yet.”

- [ ] **Step 2: Investor detail page**

```tsx
// Pattern: getStaffContext → getInvestorDetailForStaff → listAccessEventsForAuthUser
// Stack: Profile table → <PersonAccessPanel events={events} />
// Links back to /admin/investors
```

- [ ] **Step 3: List page links**

Wrap investor full name (or email) in `<Link href={/admin/investors/${id}}>`.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
add investor detail page with access history panel

EOF
)"
```

---

### Task 9: Lead + staff surfaces

**Files:**
- Modify: `apps/web/app/admin/leads/lead/[leadId]/page.tsx`
- Create: `apps/web/app/admin/staff/[staffId]/page.tsx`
- Modify: `apps/web/app/admin/staff/page.tsx`
- Extend: `apps/web/lib/access/admin-actions.ts` and/or `lib/staff/admin-actions.ts` with `getStaffDetailForSuperAdmin(staffId)`

**Interfaces:**
- Lead: if `lead.investorId`, load investor `authUserId` (scoped via existing lead visibility already), then `listAccessEventsForAuthUser`; render `<PersonAccessPanel />` below Contact. Link to `/admin/investors/[id]` when linked.
- Staff: super admin only; agents hitting URL → redirect `/` or `notFound()`. Show email/role + access panel for `staff.authUserId`.

- [ ] **Step 1: Wire lead panel**

- [ ] **Step 2: Staff detail + list links**

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
show access history on linked leads and staff detail

EOF
)"
```

---

### Task 10: Docs + verify checklist

**Files:**
- Modify: `apps/web/docs/SETUP.md`
- Create: `apps/web/docs/plan-access-enrichment-verify.md`

- [ ] **Step 1: Document env**

| Var | Required | Notes |
|-----|----------|-------|
| `IP_ENRICHMENT_API_URL` | No | Template with `{ip}`, e.g. `https://api.example.com/{ip}` |
| `IP_ENRICHMENT_API_KEY` | No | Bearer token when required by provider |
| `IP_ENRICHMENT_MMDB_PATH` | No | Absolute path to MaxMind-style city DB on server |

Note: Coolify/Njalla must forward `X-Forwarded-For`; private IPs show as partial/local.

- [ ] **Step 2: Verify doc** — migrate DB; sign in as investor; confirm row in DB; open `/admin/investors/[id]` as agent (assigned) vs other agent (404); staff detail as super admin; lead with linked investor shows panel.

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
document access enrichment setup and verification

EOF
)"
```

---

### Task 11: Final verification

- [ ] **Step 1: Migrate local DB**

```bash
cd apps/web && npm run db:migrate
```

- [ ] **Step 2: Full test suite**

```bash
cd apps/web && npm test
```

Expected: all prior tests + new access-* tests green.

- [ ] **Step 3: `npm run build`**

Expected: success.

- [ ] **Step 4: Confirm no Phase 4 i18n / no investor-facing history UI**

- [ ] **Step 5: Commit only if verify doc tweaks remain; otherwise done**

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|---|---|
| Durable `user_access_events` | 1 |
| Capture on sign-in | 5 |
| Max enrichment fields + hybrid API→local | 4 |
| Cache on row once | 5 |
| Book-scoped ops visibility | 6–7 |
| Stack layout A investor card | 8 |
| Lead reuse when linked | 9 |
| Staff history super-admin only | 9 |
| Non-blocking auth / private IP / failures | 4–5 |
| SETUP + verify | 10–11 |
| Out of scope respected | Global + Task 11 |

No intentional placeholders left in steps.
