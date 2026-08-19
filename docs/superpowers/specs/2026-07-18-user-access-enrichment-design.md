# User access events & IP enrichment — Design

**Date:** 2026-07-18  
**Status:** Approved (2026-07-18)  
**Depends on:** Ops agents Phase 1–3 (`2026-07-18-ops-agents-leads-i18n-design.md`); one-server hosting (`2026-07-18-one-server-crypto-hosting-design.md`)

## Goal

Capture every successful platform sign-in with IP and user-agent, enrich each event once (country/flag, city, region, timezone, ISP/org, VPN/proxy/datacenter hints, UA summary), and show a durable history on ops person cards — book-scoped for agents, full access for super admins.

## Decisions locked

| Topic | Choice |
|---|---|
| Audience | Ops only (not investor-facing) |
| History | Full trail of sign-ins, not last-known only |
| Enrichment depth | Max: geo + ISP + UA parse + VPN/proxy/datacenter when available |
| Visibility | Super admin + agents for their assigned book (same scoping as Phase 1–3) |
| Lookup | Hybrid: API first → local MMDB fallback; resolve once per event; cache on the row |
| Persistence | Dedicated `user_access_events` table (not live Better Auth `session` alone; not dump into `audit_events`) |
| Person card layout | Stacked: profile → latest access → access history |
| Staff history | Super admins can view staff access history; agents cannot browse other staff |

## Out of scope (v1)

- Dialer / live tracking of every HTTP request (sign-in only)
- Investor-facing “your login history” UI
- Automatic retention purge jobs (keep events; purge can be added later)
- List-page “last: 🇫🇷” hints (optional follow-up)
- Exact GPS or full raw request headers in the UI
- Phase 4 client i18n (admin remains English)

## Data model

### Table: `user_access_events`

| Column | Notes |
|---|---|
| `id` | UUID PK |
| `auth_user_id` | Better Auth `user.id` (text) |
| `occurred_at` | Sign-in timestamp |
| `ip_address` | Client IP after proxy parsing |
| `user_agent` | Raw UA string |
| `ua_browser`, `ua_os`, `ua_device` | Parsed summaries (nullable) |
| `country_code`, `country_name`, `region`, `city`, `timezone` | Geo (nullable until enriched) |
| `isp`, `org` | Provider fields (nullable; either may be null) |
| `is_proxy`, `is_vpn`, `is_datacenter` | Nullable booleans |
| `enrichment_status` | `pending` \| `ok` \| `partial` \| `failed` |
| `enrichment_source` | `api` \| `local` \| `none` |
| `enrichment_raw` | Optional jsonb for debug; not shown in UI by default |
| `session_id` | Nullable link to Better Auth session id when available |

Indexes: `(auth_user_id, occurred_at DESC)`.

Better Auth `session.ip_address` / `user_agent` remain the auth layer’s own fields; ops history does **not** depend on session row lifetime.

## Capture & enrichment flow

1. On successful Better Auth email/password sign-in (investors and staff), resolve client IP from `x-forwarded-for` (leftmost public hop; document Coolify proxy trust) or connection address.
2. Insert `user_access_events` with IP, UA, parsed UA fields, `enrichment_status=pending`.
3. Enrich in-process after insert (no separate worker in v1): call configured API (≈2s timeout) → on failure/timeout/missing key, try local MMDB → update the same row once.
4. Private/loopback IPs (local dev): skip external lookup → `partial`, treat as local/private.
5. Sign-in must succeed even if insert or enrichment fails (log; do not block auth UX).

### Config (env)

- `IP_ENRICHMENT_API_URL` / `IP_ENRICHMENT_API_KEY` (optional)
- `IP_ENRICHMENT_MMDB_PATH` (optional local MaxMind-style DB)
- Feature degrades gracefully if either is missing (IP/UA still stored)

## UI

### Primary: `/admin/investors/[investorId]`

Stacked layout:

1. **Profile** — name, email, phone, country, assignment, account/onboarding status  
2. **Latest access** — flag from `country_code`, city/region, IP, UA summary, ISP/org, VPN/proxy/datacenter hints, time  
3. **Access history** — newest-first list with the same per-row fields  

Empty history: show empty state (no fabricated “latest”). Failed enrichment: always show IP + UA; geo line as “Unknown” with status.

### Shared panel

Extract a shared access panel reused on:

- Investor detail (above)
- Lead detail when `investorId` is linked (same auth user’s events)
- Staff detail at `/admin/staff/[staffId]` (super admin only) for that staff `authUserId`

Lead without linked investor: no access panel.

Flags: emoji or small local SVG from ISO country code — no third-party image CDN.

## Access control

- Agents: only events for `auth_user_id` belonging to investors (or linked leads) assigned to them.
- Super admins: all events.
- Unscoped access → **404** (same pattern as leads), not a verbose 403.
- Investors never see this UI or API.

## Errors & edge cases

| Case | Behavior |
|---|---|
| Enrichment API down | Local fallback; else `failed`/`partial` |
| Malformed UA | Parsed fields null; raw UA kept |
| Rapid / multiple logins | One event per successful sign-in |
| Missing API key and MMDB | Store IP/UA; status `failed` or `partial`, source `none` |

## Testing

- Unit: IP header parse, UA parse, enrichment field mapping, scoped visibility helpers.
- Authz: agent cannot read another book’s events; super admin can.
- Manual verify doc: sign-in → row appears → enrichment fills → admin card shows flag + history.

## Implementation notes

- Prefer small modules: `lib/access/ip.ts`, `lib/access/ua.ts`, `lib/access/enrich.ts`, `lib/access/events.ts`, `lib/access/admin-actions.ts`.
- Hook into Better Auth post-login path without forking the auth library.
- Optional audit action `user.access_recorded` if insert succeeds; skip if insert failed.
- Align admin page styling with existing admin/lead detail patterns (English admin UI).
