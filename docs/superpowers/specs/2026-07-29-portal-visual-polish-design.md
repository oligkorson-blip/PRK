# Investor Portal Visual Polish — Design

Date: 2026-07-29  
Status: Approved  
Scope: `apps/web` investor portal (`/portal/*`) — visual continuity with the public brand

## Intent

Make the investor portal feel like the same Parkwise product as the public site:
shared type hierarchy, cream/paper surfaces, calmer spacing and cards — while keeping
the existing dark sidebar workspace and information architecture.

This is a **visual polish** pass (Approach A: soften the existing shell), not a
redesign of nav, flows, or copy strategy.

## Decisions

| Choice | Decision |
|--------|----------|
| Depth | Full portal surface (all six sections) |
| Approach | Soften existing shell — keep dark sidebar + IA |
| Admin | Untouched (`admin-shell` is separate) |
| CSS architecture split | Deferred (audit P2) — polish in existing `globals.css` |
| Mobile drawer rewrite | Out — only rhythm/padding alignment |
| Main canvas | `.dash` background → `--cream`; cards/panels stay `--paper` |
| Empty CTAs | One primary CTA; optional secondary ghost allowed |
| Existing late polish | Consolidate/replace the late portal block (~6185+); do not add a third layer |

## Out of scope

- New nav items or IA changes
- Product logic / timeline rules / KYC flow changes
- Fake “verified” or compliance theater chrome
- Splitting `globals.css` into layers
- Rewriting the mobile drawer beyond spacing/topbar rhythm
- Admin workspace polish (do not change rules that target `.admin-*`)

## Current baseline

- Shell: `components/portal-shell.tsx` → `.dash` / `.dash-side` / `.dash-main`
- Pages already share patterns: `portal-page-head`, `display-m` / `display-s`,
  `dash-kpi`, `dash-panel`, `interest-card`, `empty-state`, `portal-kv`,
  `portal-banner`, `portal-file-list`, `status-timeline` (access timeline)
- `--dash-bg` (`#f7f7f3`) is near cream but not the public cream token; replace
  usage for `.dash` with `--cream`
- Sidebar uses `--green-950` (keep)
- **Important:** `globals.css` already has a late portal polish block (~6185+) with
  hardcoded hexes and 8px radii. That block also sits near admin overrides.
  This slice **consolidates** portal/dash rules onto design tokens and public
  radii; leave `.admin-*` selectors untouched.

## Design

### 1. Shell & brand continuity

**Keep:** dark green sticky sidebar, current NAV links, drawer behavior, topbar structure.

**Change:**

- Main canvas: `.dash { background: var(--cream); }` (cards/panels remain `--paper`).
- Type: page titles stay `display-m` / section titles `display-s`; leads use
  `var(--muted)` (not one-off hex greys).
- Sidebar inactive nav: `color: var(--on-dark-faint)`; hover stays subtle white wash;
  **active:** keep green fill (`--green-800`) + `--on-dark` text — do not invent a
  new active pattern; only reduce hover noise if needed.
- Foot links: same faint → on-dark hover as today, tokenized.
- Topbar: crumb + welcome spacing aligned with page-head rhythm; border uses
  `var(--line)` / `var(--line-soft)`, not hardcoded greys.
- Brand in sidebar: keep existing mark; no new logo treatment.

### 2. Shared page patterns (all six routes)

Apply one kit across:

| Route | Role |
|-------|------|
| `/portal` | Overview (getting-started **or** funded) |
| `/portal/interests` | Requests |
| `/portal/holdings` (+ detail) | Investments |
| `/portal/documents` | Documents |
| `/portal/kyc` | Identity check |
| `/portal/settings` | Profile & security |

**Page head:** eyebrow → `display-m` → lead → optional `portal-banner`; shared gaps
(token spacing).  
**Sections:** `display-s` + optional `field-hint`, then content; shared section spacing.  
**KPI / panels:** keep `dash-kpi` / `dash-panel`; `--paper`, `var(--line-soft)`,
public `--radius-m` (not 8px); hover only on link KPIs.  
**List rows:** unify `interest-card` and file rows (padding, meta muted, clear primary).  
**Timeline:** include `.status-timeline` / access timeline in the same surface pass
(borders, type, pills) so overview does not look like a third system.  
**Empty states:** title + one sentence + **one primary CTA**; optional secondary
ghost allowed (e.g. documents: primary “Public documents”, secondary “View investments”).  
**Settings / KYC:** `portal-kv` and file list use the same paper / line / radius language.  
**Mobile:** existing drawer; topbar + content padding follow the same rhythm.

### 3. Edges

- Getting-started vs funded overview: same head/section kit; timeline / next-action logic unchanged.
- Empty lists (requests, holdings, documents): shared empty block + CTA rules above.
- Banners: status / next-step only — no new “verified” chrome.
- Prefer CSS token and class alignment; markup edits only where a page is missing
  the shared head structure or empty-state pattern.
- When editing `globals.css`, scope changes to `.dash`, `.dash-*`, `.portal-*`,
  `.interest-card`, `.empty-state`, `.status-timeline` as used in portal — **never**
  retune `.admin-*` in the same edit pass.

## Implementation notes

- Primary touch: `apps/web/app/globals.css` — merge early portal/dash rules with the
  late polish block into one coherent, tokenized set (or clearly override once).
- Light markup in portal pages / `portal-shell.tsx` only for structure gaps.
- Preserve established portal class names so behavior and tests stay stable.
- Do not change `admin-shell` or admin CSS.

## Testing / verification

Checklist (manual):

- [ ] `/portal` getting-started (or funded if seeded)
- [ ] `/portal/interests`
- [ ] `/portal/holdings` and one holding detail if present
- [ ] `/portal/documents`
- [ ] `/portal/kyc`
- [ ] `/portal/settings`
- At **desktop** and **~390px** for each
- Spot-check one **admin** page: no visual regression from CSS edits

Automated:

- `npx tsc --noEmit`
- Portal-related vitest + full `npx vitest run` before push
- No new e2e unless a cheap portal landmark already exists

## Success criteria

1. Portal main canvas uses `--cream`; cards/panels use `--paper` and public radii/tokens.
2. Overview (incl. timeline), interests, holdings, documents, KYC, and settings share one visual system.
3. Dark sidebar workspace and IA unchanged; active nav remains green-fill clear.
4. Admin and public marketing surfaces not regressively restyled.
5. Late hardcoded portal hex/radius overrides are gone or replaced by tokens.
