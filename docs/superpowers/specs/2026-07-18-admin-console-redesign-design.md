# Admin console redesign — Design

**Date:** 2026-07-18  
**Status:** Approved (brainstorm 2026-07-18)  
**Depends on:** Existing admin routes and staff auth; brand tokens in `apps/web/app/globals.css`

## Goal

Replace the plain `/admin` link list and sparsely styled admin pages with a brand-forward hybrid console (compact top bar + collapsible sidebar), a role-aware home hub, and consistent list/detail patterns across all admin surfaces — without changing business logic, APIs, or permissions.

## Decisions locked

| Topic | Choice |
|---|---|
| Scope | Full console: shell + hub + restyle all admin list/detail pages |
| Chrome | Hybrid: compact top bar + collapsible left sidebar |
| Visual | Brand-forward (Parkwise cream / green / lime / Archivo from existing tokens) |
| Dashboard home | Role-aware mix (agents = book queues; super = pool / staff / assets) |
| Approach | Admin shell layout + shared components + CSS pass (not a new design system) |
| List pattern | Page header + actions · optional toolbar · dense table in white panel |
| Detail pattern | Identity header + primary CTA · section panels (2-col facts, full-width timelines/forms) |
| Mobile | Hamburger → overlay drawer; desktop sidebar → icon rail when narrow |
| Forms / APIs | Restyle only — no new features, filters backends, or permission changes |

## Out of scope

- New search/filter APIs or query backends (toolbar chrome only where data already supports filtering)
- Portal / marketing site redesign
- New error UI framework (keep redirect / FORBIDDEN / `notFound`)
- Changing staff roles, book scoping, or server actions
- Replacing form behavior (log call, promote/demote, create list, interest actions, etc.)
- Dark mode or a separate admin design-token set (reuse `:root` brand tokens)

## Information architecture

### Nav (role-aware)

**Work** (all staff)

- Home → `/admin`
- Leads → `/admin/leads`
- Investors → `/admin/investors`
- Interests → `/admin/interests`
- Documents → `/admin/documents`

**Platform** (super admin only)

- Staff → `/admin/staff`
- Assets → `/admin/assets`

**You**

- Portal → `/portal` (exit admin chrome)

Active route highlighting by pathname prefix (e.g. `/admin/leads/...` marks Leads).

### Routes in scope (restyle)

| Route | Role notes |
|---|---|
| `/admin` | Role-aware hub (replaces link list) |
| `/admin/leads`, `/admin/leads/[listId]`, `/admin/leads/lead/[leadId]` | Agent book vs super lists unchanged |
| `/admin/investors`, `/admin/investors/[investorId]` | Incl. access panels already present |
| `/admin/interests`, `/admin/documents` | |
| `/admin/staff`, `/admin/staff/[staffId]` | Super only (nav + pages already gated) |
| `/admin/assets` | Super only |

No new routes required.

## Visual system

Reuse existing CSS variables in `globals.css`:

- Surfaces: `--cream`, `--surface-subtle`, `--paper`, `--line`
- Ink: `--ink`, `--muted`
- Brand chrome: `--green-900` / `--green-800` top bar; `--lime` accent on mark / focus
- Type: `--font-display` (Archivo) for titles; `--font-body` (Inter) for UI
- Radius / shadow: existing `--radius-*`, `--shadow-*`

Admin must read as Parkwise ops, not a generic purple/gray dashboard.

### Motion (intentional, limited)

1. Sidebar / drawer slide open-close  
2. Table row hover background fade  
3. Light main-content fade-in on navigation (CSS only; no animation library required)

## Shell architecture

### Layout

Add `apps/web/app/admin/layout.tsx` wrapping all `/admin/*`:

- Renders `AdminShell` (top bar + sidebar + main slot)
- Resolves staff via existing `getStaffContext` / `requireStaff` patterns
- Unauthenticated / non-staff: same redirect behavior as today (layout or children)
- Marketing `site-header` does **not** appear inside admin; admin chrome owns the subtree

### Shared components (small set)

| Component | Responsibility |
|---|---|
| `AdminShell` | Top bar (mark, breadcrumb/section, role pill, avatar/initials), sidebar/drawer, collapse, children |
| `AdminNav` | Role-aware link groups; active state; badge counts optional later (not required v1) |
| `AdminPageHeader` | Title, optional subtitle, action slot |
| `AdminSection` | Titled panel for detail blocks |

Prefer colocating under `apps/web/components/admin/` (or equivalent existing components folder).

### CSS

Extend `.admin-*` in `globals.css` (and/or a focused admin partial imported from there):

- `.admin-shell`, `.admin-topbar`, `.admin-sidebar`, `.admin-main`
- Refine `.admin-page`, `.admin-table` for denser branded tables
- Breakpoints: icon rail ~960px; drawer below that (exact breakpoints chosen at implement time to match existing media queries)

Reuse `.btn`, `.form-field`, `.lead` where they already fit; do not invent parallel button systems.

## Hub (`/admin`)

### Agent

- Title: book-oriented (e.g. “Your book”)
- Widgets from **existing** list/count data already available to the agent (open leads, interest queue summaries) — no new aggregations APIs in v1 if counts require heavy new queries; prefer deriving from current admin-actions or simple counts already used on list pages
- “Next” / attention list linking into leads / interests

### Super admin

- Title: operations-oriented (e.g. “Operations”)
- Widgets for pool / staff / assets / docs attention using data already fetchable with current staff actions
- Nav includes Platform group

If a desired hub metric is not cheaply available from existing actions, show a short link card to that admin section instead of inventing new queries in this redesign.

## List pages

Pattern:

1. `AdminPageHeader` (title, short subtitle, primary/secondary actions already on the page)
2. Optional toolbar only when the page already has filter/search UX or a trivial client filter is acceptable without backend change
3. Content in white bordered panel: existing tables upgraded via `.admin-table` styles; empty state = one sentence + existing create/action CTA when present

Preserve all current links, forms, and row actions.

## Detail pages

Pattern:

1. Identity header: name/title, type label, status badge when already shown, primary action (e.g. Log call)
2. Section panels via `AdminSection`: contact/profile facts in up to two columns; timelines, call history, access history, and forms full width
3. Keep stacked content order where product already defined it (e.g. investor: profile → latest access → history)

No card-heavy marketing layouts; panels are structural containers for ops content.

## Mobile & responsive

| Width | Behavior |
|---|---|
| Wide desktop | Persistent sidebar expanded |
| Mid (~960px) | Sidebar collapses to icon rail; labels via title tooltip or expand control |
| Narrow | Sidebar hidden; hamburger in top bar opens overlay drawer + scrim |

Touch targets remain usable (≥40px where practical on nav items).

## Empty & error states

- **Empty:** one short sentence; include the page’s existing primary CTA when one exists  
- **Errors:** unchanged — redirect on forbidden, `notFound()` where used today; no toast framework in this pass

## Testing & verification

- Existing admin / staff tests continue to pass (auth gating, lead book scoping, etc.)
- Add lightweight UI smoke where valuable: shell renders nav items by role; hub differs for agent vs super (component or route-level tests matching project conventions)
- Manual verify: desktop shell, icon rail, mobile drawer, one list + one detail per major area (leads, investors, staff for super)

## Implementation notes

- Approach: layout + shared components + CSS pass across pages listed above  
- Prefer worktree / feature branch for implementation after the plan is written  
- Do not change Docker, auth secrets, or investor-facing pages as part of this work

## Success criteria

1. Every `/admin` page sits inside the hybrid shell with correct role-aware nav  
2. `/admin` is a useful role-aware hub, not a bare link list  
3. Lists and details share the header / table / section patterns and look brand-consistent  
4. Mobile drawer works; no horizontal overflow on tables beyond existing scroll pattern  
5. No regressions in staff permissions or form/server-action behavior  
6. Visual check: first admin viewport still reads as Parkwise after removing generic “Admin” copy from the mental model (green/cream/lime, not SaaS-gray)
