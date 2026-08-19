# Ops agents Phase 2 verification

Manual checks for lead lists, CSV upload, agent assignment, and signup email → lead linking.

## Prerequisites

1. Phase 1 complete: `SUPER_ADMIN_EMAILS` set, super admin signed up, at least one agent promoted on `/admin/staff`.
2. Migrate schema including `lead_lists` and `leads` (`npm run db:migrate`).
3. Seed catalogue if needed (`npm run db:seed`).

## Phase 2 checklist

- [ ] Super creates a lead list on `/admin/leads` and downloads the CSV template (`/admin/leads/template`).
- [ ] Upload a CSV with `source` / `source_detail` columns; bad lines show row errors (valid rows still import).
- [ ] Assign leads to an agent; that agent sees only their assigned leads on `/admin/leads`.
- [ ] New signup with a matching lead email links the lead (`investorId`) and inherits `assigned_agent_id` when set.
- [ ] Signup matching an **unassigned** lead links the lead but investor stays in the unassigned pool.

## Create list + template (detail)

- [ ] Super opens `/admin` → **Leads** → `/admin/leads`.
- [ ] Create a list (name + optional default source) → list appears in the table.
- [ ] Download CSV template → file `leads-template.csv` with headers:
  `full_name,email,phone,source,source_detail,notes` and one example row.
- [ ] Agent cannot create lists or download the template (no create UI; template route forbidden).

## CSV upload (detail)

- [ ] Super opens a list (`/admin/leads/[listId]`) → upload CSV.
- [ ] Valid rows create leads with `source` / `source_detail` (or list `defaultSource` when source cell empty).
- [ ] Missing email, empty name, or empty source (with no default) produce per-line errors; other rows still import.
- [ ] Agent has no upload UI on list detail.

## Assign + agent scope (detail)

- [ ] Super assigns a single lead (or assign-all) to an agent → lead shows that agent.
- [ ] Agent `/admin/leads` shows a flat table of **assigned leads only** (no other agents’ leads).
- [ ] Agent cannot assign leads (no assign controls; server actions forbidden).
- [ ] Super can reassign or unassign leads.

## Signup link (detail)

- [ ] Lead with email `match@example.com` assigned to agent A.
- [ ] New user signs up with `match@example.com` → `/portal` creates investor.
- [ ] Lead row gains `investorId`; investor `assigned_agent_id` = agent A.
- [ ] Lead with email `pool@example.com` **unassigned**.
- [ ] New user signs up with `pool@example.com` → lead linked; investor remains unassigned (pool on `/admin/investors?filter=unassigned`).
