# User access enrichment verification

Manual checks for sign-in access events: IP/UA capture, hybrid enrichment, and ops-only history panels on investor, linked-lead, and staff detail pages.

## Prerequisites

1. Ops Phase 1 complete: `SUPER_ADMIN_EMAILS` set, super admin signed up, at least one agent promoted, at least one investor assigned (see `docs/plan-ops-phase1-verify.md`).
2. Migrate schema including `user_access_events` (`npm run db:migrate`).
3. Seed catalogue if needed (`npm run db:seed`).
4. Optional enrichment env in `.env.local` (see `docs/SETUP.md`): `IP_ENRICHMENT_API_URL` / `IP_ENRICHMENT_API_KEY`, and/or `IP_ENRICHMENT_MMDB_PATH`.

## Access enrichment checklist

- [ ] `npm run db:migrate` applies migration with `user_access_events` (no errors).
- [ ] Investor sign-in creates a row in `user_access_events` linked to their Better Auth `user.id`.
- [ ] Super admin opens `/admin/investors/[investorId]` → **Profile**, **Latest access**, and **Access history** sections render.
- [ ] Assigned agent can open their investor’s detail page and see the same access panel.
- [ ] Another agent opening the same `/admin/investors/[investorId]` gets **404** (not found).
- [ ] Super admin opens `/admin/staff/[staffId]` → staff profile + access history; agents cannot open staff detail.
- [ ] Lead with linked investor (`investorId` set) shows the access panel on `/admin/leads/lead/[leadId]`; unlinked lead does not.

## Migrate database (detail)

- [ ] From `apps/web`: `npm run db:migrate`.
- [ ] Confirm table exists, e.g. `\d user_access_events` in `psql`, or inspect via Drizzle Studio if used locally.

## Sign-in creates row (detail)

- [ ] Sign out; sign in as an investor (email + password) via `/sign-in`.
- [ ] Sign-in succeeds regardless of enrichment config (auth must not block on access logging).
- [ ] In Postgres, a new `user_access_events` row exists for that user’s `auth_user_id` with `occurred_at` ≈ sign-in time, `ip_address`, and `user_agent` populated when headers allow.
- [ ] `enrichment_status` is one of `pending`, `ok`, `partial`, or `failed` (local/private IP → `partial`; missing API/MMDB → often `failed` or `partial`).
- [ ] Sign in again → a **second** row appears (full trail, not last-known only).

Example query (replace email):

```sql
SELECT uae.occurred_at, uae.ip_address, uae.enrichment_status, uae.country_code, uae.city
FROM user_access_events uae
JOIN "user" u ON u.id = uae.auth_user_id
WHERE u.email = 'investor@example.com'
ORDER BY uae.occurred_at DESC
LIMIT 5;
```

## Admin investor card (detail)

- [ ] Super admin: `/admin/investors` → click investor email/name → `/admin/investors/[investorId]`.
- [ ] **Profile** shows name, email, phone, country, assigned agent, account/onboarding status.
- [ ] **Latest access** table shows When, Location (flag + city/region when enriched), IP, Device (UA summary), Provider, Network (VPN/proxy/datacenter when known).
- [ ] **Access history** lists older sign-ins **newest first** (latest row is only in Latest access).
- [ ] With no sign-ins yet, panel shows “No access events yet.” (no fabricated data).

## Agent scoping (detail)

- [ ] Investor assigned only to agent A.
- [ ] Agent A opens `/admin/investors/[thatInvestorId]` → detail + access panel visible.
- [ ] Agent B opens the same URL → **404**; cannot load another book’s access events.
- [ ] Super admin can open any investor detail and see full history.

## Staff detail (detail)

- [ ] Super admin: `/admin/staff` → click staff email → `/admin/staff/[staffId]`.
- [ ] Profile (email, role) + **Latest access** / **Access history** for that staff member’s sign-ins.
- [ ] Agent cannot open `/admin/staff/[staffId]` (redirect / forbidden; no staff browse for agents).

## Linked lead panel (detail)

- [ ] Use a lead whose email matches a registered investor so `investorId` is linked (see `docs/plan-ops-phase2-verify.md`).
- [ ] Agent assigned to that lead opens `/admin/leads/lead/[leadId]` → access panel appears below lead sections (same events as investor detail for that auth user).
- [ ] Lead **without** `investorId` → no access panel on lead detail.
- [ ] Agent cannot open a lead outside their book (404); super admin can open any linked lead and see the panel.

## Production / proxy notes

- [ ] On Coolify/Njalla, confirm `X-Forwarded-For` reaches the app so `ip_address` reflects the visitor, not only the proxy.
- [ ] Local dev (`127.0.0.1` / private LAN): expect `enrichment_status=partial` and Location “Unknown (partial)” — IP/UA still stored.
