# Ops agents Phase 1 verification

Manual checks for `super_admin` / `agent` staff roles, investor pool assignment, and scoped admin views.

## Prerequisites

1. Set `SUPER_ADMIN_EMAILS` in `.env.local` (or Coolify / compose env). Prefer this over deprecated `ADMIN_EMAILS`.
2. Migrate schema including `staff_profiles` and `investors.assigned_agent_id` (`npm run db:migrate`).
3. Seed catalogue if needed (`npm run db:seed`).

## Phase 1 checklist

- [ ] Set `SUPER_ADMIN_EMAILS`, sign up that email → `/admin` works; `staff_profiles` row upserted with `role = super_admin`.
- [ ] Second user signs up → promote to agent on `/admin/staff`.
- [ ] Third user (investor) appears in Unassigned on `/admin/investors` → assign to the agent.
- [ ] Agent sees only that investor’s interests; cannot see others.
- [ ] Agent cannot open asset status controls (`/admin/assets` forbidden / not linked).
- [ ] Super admin sees all investors, interests, and asset controls.

## Investor assignment (detail)

- [ ] Super admin opens `/admin` → **Investors** → `/admin/investors` lists all investors (email, name, assigned agent, status).
- [ ] Super admin uses **Filter unassigned** (`?filter=unassigned`) to show only the pool (`assigned_agent_id` null).
- [ ] Super admin assigns an unassigned investor via the dropdown → row shows the agent email; audit action `investor.assigned` with `fromAgentStaffId` / `toAgentStaffId`.
- [ ] Super admin sets dropdown to **Unassigned** → investor returns to the pool; another `investor.assigned` audit event.
- [ ] Agent opens `/admin/investors` → sees only their assigned book; no assign dropdown (read-only).
- [ ] Agent cannot call `assignInvestor` successfully (server returns Forbidden / FORBIDDEN).

## Staff promotion (detail)

- [ ] Super admin opens `/admin/staff` → sees users / staff list.
- [ ] Promote a non-staff signed-up user to `agent` → `staff_profiles.role = agent`.
- [ ] Agent cannot open `/admin/staff` (super-admin only).
