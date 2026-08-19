# Parkwise ops agents, lead lists & client i18n — Design

**Date:** 2026-07-18  
**Status:** Approved (2026-07-18)  
**Depends on:** One-server hosting (`2026-07-18-one-server-crypto-hosting-design.md`); investor MVP product rules (`2026-07-18-investor-platform-mvp-design.md`)

## Goal

Support multiple **ops agents** who only see their own clients/leads, a **super admin** who sees everything, **CSV lead lists** for cold calling (with source fields + downloadable template), **signup linking** by email, a **full call-attempt log**, and **multilingual client-facing UI** (EN / FR / DE / NL / PL). Admin/agent UI stays English in v1.

## Decisions locked

| Topic | Choice |
|---|---|
| New platform sign-ups | Unassigned **pool**; super admin assigns to agents |
| Cold-call data model | Separate **leads** + lists; link to investor on matching email signup (**C**) |
| List distribution | Super admin uploads and **assigns** leads (or bulk/list) to agents (**A**) |
| Call tracking | Full **call-attempt log** (**C**) |
| Delivery | **Phased** (Approach 2) |
| i18n v1 | Everything **clients/investors see**; admin stays English |
| Languages | English, French, German, Dutch, Polish |

## Phasing

### Phase 1 — Roles, investor pool, assignment

- Roles: `super_admin` | `agent` | `investor`
- Bootstrap: `SUPER_ADMIN_EMAILS` (env) creates/recognizes first super admin(s)
- Super admin promotes/creates agents in admin UI (not self-serve)
- `investors.assigned_agent_id` nullable; null = unassigned pool
- Super admin: list/filter unassigned + assign/reassign
- Agent: admin views of interests/holdings/docs **scoped** to assigned investors only
- Super admin: no scope filter

### Phase 2 — Lead lists, CSV, template, signup link

- Tables: `lead_lists`, `leads`
- Super admin: create list, download **CSV template**, upload CSV
- CSV columns: `full_name` (required), `email` (required for signup link), `phone` (recommended), `source` (required; list default if cell empty), `source_detail` (optional), `notes` (optional)
- Row-level validation report (skip bad rows, import good ones)
- Assign lead / bulk-assign / assign all in list → `leads.assigned_agent_id`
- Agent sees only assigned leads
- On investor signup: match `email` case-insensitively to a lead → set `lead.investor_id`; if lead assigned, set `investor.assigned_agent_id` to that agent; else leave investor in pool
- Duplicate emails across leads: prefer most recently assigned, else most recently created; write audit event

### Phase 3 — Call attempt log

- Table: `lead_call_attempts` (`lead_id`, `agent_id`, `called_at`, `outcome`, `notes`)
- Outcomes: `no_answer` | `reached` | `interested` | `not_interested` | `callback` | `wrong_number` | `other`
- Agent logs attempts only on their leads; super admin sees all
- Lead detail: history newest-first
- No dialer / telephony integration in v1

### Phase 4 — Client i18n (can parallelize after Phase 1)

- Locales: `en`, `fr`, `de`, `nl`, `pl`
- Surfaces: marketing pages, opportunities, auth, onboarding, portal, holdings, documents, legal pages
- Detection: `Accept-Language` / browser default; manual switcher; persist on investor when signed in (`preferred_locale`)
- Admin/agent console: English only in v1
- Legal page **bodies**: ship translated drafts only where counsel provides copy; otherwise English with clear “translation pending” — product strings still localized
- Tech approach: Next.js App Router locale segment or next-intl (choose in implementation plan); message catalogs per locale; no hard-coded user-visible English in client routes

## Data model (summary)

```
ops_users / role on auth user metadata or staff_profiles
  role: super_admin | agent

investors
  assigned_agent_id → staff (nullable)
  preferred_locale (nullable)

lead_lists
  id, name, default_source, created_by, created_at

leads
  list_id, full_name, email, phone, source, source_detail, notes
  assigned_agent_id (nullable), investor_id (nullable)
  created_at

lead_call_attempts
  lead_id, agent_id, called_at, outcome, notes
```

## Access rules

| Actor | Investors | Leads | Calls | CSV upload |
|---|---|---|---|---|
| super_admin | All + pool | All + pool | All | Yes |
| agent | Assigned only | Assigned only | On their leads | No |
| investor | Self | — | — | — |

All admin mutations re-check role + ownership server-side (not middleware alone).

## Out of scope (v1)

- Agent self-registration
- Agents uploading their own lists
- Shared claim-from-pool model
- Dialer / SMS / WhatsApp integrations
- Admin UI translations
- Commission / territory hierarchies
- Phone-only leads without email (email required for signup link)

## Success criteria

1. Super admin assigns pool investors and uploaded leads to agents; agents cannot see others’ books.
2. CSV template download + upload with `source` / `source_detail` works with a clear error report.
3. Matching signup links lead → investor and inherits agent when assigned.
4. Agents log multiple call attempts; history visible on the lead.
5. Client-facing flows available in EN/FR/DE/NL/PL with a language switcher.

## Relationship to existing product

Interest state machine, express-interest, holdings, document vault, and `DEMO_MODE` rules remain as today. This design adds **staff RBAC**, **CRM leads**, and **client locale** on top of the one-server stack.
