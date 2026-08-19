# SPEC — Lead assignment and ownership model (IB tier)

Implementation of the "Lead assignment and ownership model" spec on the
existing two-tier (super_admin/agent) leads system.

## Roles

`staff_role` enum: `super_admin` | `ib` | `agent`.

- **super_admin** — full platform control, both assignment routes, all reassignment options.
- **ib** — a staff profile that logs in, owns an unassigned lead queue and a team of agents.
- **agent** — belongs to exactly one IB (`staff_profiles.ib_id`, NOT NULL for agents).

## Data model changes

### staff_profiles
- add `ib_id uuid REFERENCES staff_profiles(id)` (nullable; required for agents, null for super_admin/ib).
- add `deactivated_at timestamptz` — soft delete keeps assignment history and FK references intact.

### leads (add columns)
- `status lead_status` — new|contacted|qualified|unqualified|duplicate|converted.
- `ib_id uuid REFERENCES staff_profiles(id)` — parent IB (separate field from agent).
- `assigned_by_staff_id uuid` / `assigned_at timestamptz` — who/when for the current assignment.
- `next_follow_up_at timestamptz` — next follow-up date.
- `last_activity_at timestamptz` — last call/note/assignment.
- CHECK: `assigned_agent_id IS NULL OR ib_id IS NOT NULL` (a lead never has an agent without a parent IB).

### lead_assignments (new, dedicated audit trail)
`id, lead_id, actor_staff_id, action, from_ib_id, to_ib_id, from_agent_id, to_agent_id, note, created_at`
action ∈ assign_ib | assign_agent | reassign_ib | reassign_agent | remove_agent | remove_all | return_to_ib_queue

### investors (add columns, for conversion attribution)
- `ib_id uuid` — current IB (synced from the owning lead).
- `original_agent_id uuid` / `original_ib_id uuid` — first referring agent/IB (set once, never overwritten).

## Assignment engine (lib/leads/assign/)

- `assignLeadToIb({leadId, ibStaffId})` — super_admin only. Sets IB, clears agent. Log `assign_ib`/`reassign_ib`.
- `assignLeadToAgent({leadId, agentStaffId})` — super_admin (any agent) or ib (own-queue leads, own-team agents only). IB auto-inherited from agent's parent. Log `assign_agent`/`reassign_agent`.
- `removeLeadAgent({leadId})` — super_admin (any) or ib (own team). Clears agent, keeps IB → back to IB queue. Log `return_to_ib_queue`.
- `removeLeadAssignment({leadId})` — super_admin only. Clears IB + agent. Log `remove_all`.
- `assignAllLeadsInList` — super_admin bulk variant honoring the same rules.
- `setLeadFollowUp` / `setLeadStatus` — visible staff (super/ib team/assigned agent).
- Linked-investor sync: agent/IB changes on a converted lead update `investors.assignedAgentId` + `ibId`; `original_*` written once.

## Staff lifecycle (lib/staff/promote-actions.ts, transfer-actions.ts, demote-actions.ts)

- `promoteToIb({email})` / `promoteToAgent({email, ibStaffId})` — parent IB mandatory for agents.
- `transferAgentToIb({agentStaffId, toIbStaffId, leadStrategy})` — leads stay with original IB (back to its queue) or move with the agent; super admin decides explicitly; logged.
- `demoteAgent({staffId, leadStrategy})` — mandatory strategy: return to IB queue / unassign all / reassign to teammate. Soft-delete.
- `demoteIb({staffId, teamStrategy})` — whole team (agents, leads, investors) reassigned to another IB. Soft-delete.

## Permission model

- super_admin: everything.
- ib: own unassigned queue + all team leads/investors/interests/distributions/documents; assign/reassign within own team only; cannot cross teams.
- agent: own leads only; no assignment powers.
- Deactivated staff (`deactivated_at` set) lose all access (`getStaffContext` returns null).

## Migration path

- `0014_ib_lead_ownership.sql` — schema (enum + tables + columns + check).
- `0015_staff_soft_delete.sql` — deactivated_at.
- `scripts/ib-backfill.ts` (`npm run db:ib-backfill`) — idempotent data backfill for existing deployments (placeholder IB, lead/investor linking, seeded assignment history). Runs as a script, not a migration, because a new enum value cannot be used inside the migrator's single transaction.
