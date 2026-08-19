# Parkwise CRM Redesign — Design Spec

Date: 2026-07-23
Status: Approved (goal mode, auto)
Scope: `apps/web` admin back office (+ supporting lib)

## Intent

Redesign the admin back office into a **simple, clean CRM** that feels familiar to anyone who has used HubSpot/Pipedrive-class tools. Ops, IBs, and agents manage **their leads** and **their investors** (investors = leads that became clients). **Only super admins create investment opportunities.** Ease of use — on desktop, tablet, and phone — is the primary design goal.

Principles: one clear job per screen; queues and search over navigation depth; every list is searchable/paginated; every record shows its story in one place; nothing clever, nothing cramped.

## A. Leads (`/admin/leads`) — manage the pipeline

Current state: role-scoped lists with stages, call logging, follow-up dates — but unbounded tables, no search, no stale visibility, bulk actions missing, and two correctness bugs.

1. **Search + pagination**: server-side search (name or email substring, case-insensitive) and offset pagination (25/page) on the leads list, preserving role scoping (`super_admin` all, IB queue + team, agent own book). Filter by stage via the existing chip/select pattern.
2. **Stale flags**: non-terminal lead with `lastActivityAt` older than 7 days gets an amber "Stale" badge; a stale count appears in the section header.
3. **Bulk stage update**: row checkboxes + sticky bulk-action bar (Mark contacted / Qualified / Unqualified). One scoped server action, per-row audit events, per-row error collection (partial success reported, no silent skips).
4. **Correctness fixes** (from prior review): `setLeadStatus` refuses to move a lead out of `converted` when `investorId` is set; the IB "Unassigned leads" queue excludes terminal statuses (unqualified/duplicate/converted) like every workload query already does.
5. Lead detail page stays as-is (call log, stage, follow-up) — it already matches the CRM record pattern.

## B. Investors (`/admin/investors`) — manage clients

Investors are the converted leads — the CRM's "customers". The record must answer everything in one place.

1. **List parity with leads**: same server-side search + pagination (25/page), keeping the existing status filters and inline agent assignment.
2. **New "Holdings & Payments" tab** on the investor record: holdings (asset name, amount, target yield, status, confirmed date) + full distribution history for the investor. Closes the known gap: staff cannot currently answer "what do they hold, what did we pay them" from the record.
3. **New "Activity" tab**: one chronological timeline, newest first, merging:
   - **System events** from `audit_events` where `entityType = 'investor'` and `entityId = investor.id` (rendered as friendly lines: who did what, when), and
   - **Manual notes** from a new table `investor_notes` (`id`, `investorId`, `authorStaffId`, `body`, `createdAt`).
   A note composer sits atop the tab. `addInvestorNote` is scoped (`investorVisibleToStaff`), returns `{ ok, error }`, and writes an `investor.note_added` audit event (so notes appear in the timeline too).
4. Tab order: Profile · Application · KYC · **Holdings & Payments** · Interests · **Activity** · Access.

## C. Opportunities (`/admin/assets`) — super-admin only creation

Current state: assets are seed-only; the page offers status flips, capacity, image URLs. Only super admins may add opportunities (page is already super-admin gated).

1. **"New opportunity" create flow** (super admin only): a single clean form creating an asset in `draft` status with the fields the catalogue needs — name, city, country, site type, operator, min ticket, target payment frequency, term, target yields per option (Standard/Premium/EV as applicable), advisory capacity, description, cover image URL.
   - Validation reuses the existing catalogue invariants (`validateInvestmentOptions`: income = min × yield, monotonic yields, income mix sums to 100 with parking dominant) so a created asset can never break the consumer pages.
2. **Edit basics**: same form, pre-filled, for draft assets (published assets stay status-managed only — no editing live offers in this round).
3. Server actions `createAsset` / `updateDraftAsset`: `requireSuperAdmin`, `{ ok, error }`, audit events (`asset.created`, `asset.updated`), revalidate consumer catalogue.

## D. Dashboard (`/admin`) — the CRM home

Familiar CRM home, role-aware as today:

1. **KPI row**: investors in book, new leads this week, pending KYC, distributions due this month (scheduled count). Compact cards, 4-up → 2-up → 1-up.
2. **Queues section** (existing counts, preserved): pending applications, pending interests + KYC-blocked, unassigned investors, lead SLA.
3. **Activity feed**: latest ~15 `audit_events` visible within the staff member's scope — actor, friendly action line, relative time. Agents/IBs see their book's events only (filter by entity visibility via the same scoping helpers; if an event's entity is not resolvable in scope, skip it).
4. **Stale leads widget**: count + link to the leads view.

## E. Cross-cutting standards (applies to every new/changed screen)

- Staff scoping via `investorVisibleToStaff` / existing lead scoping, enforced inside queries/actions; super admins unrestricted.
- Server actions return `{ ok: true, ... }` / `{ ok: false, error }`; no throws for expected failures; authorization inside the action.
- Audit events on every mutation.
- Responsive per the design system: `.table-wrap` on every table, compact variants on phones, tap targets ≥ 40px, no raw enum strings (use `lib/portal/labels.ts` pattern), no inline styles where `stack-*` utilities exist.
- Migrations only via `npm run db:generate` (never edit applied migrations; head: 0017).
- Vitest coverage for every new query/action; `npx tsc --noEmit`, `npx vitest run`, `npm run build` green before done. Node via `export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"`.

## Out of scope (next rounds)

Kanban board, distribution runs/batching, scheduled-vs-received reconciliation, cents migration, four-eyes on payouts, support tickets, wallet, investor-facing changes.
