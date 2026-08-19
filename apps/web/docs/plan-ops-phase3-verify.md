# Ops agents Phase 3 verification

Manual checks for lead call attempt logging: outcomes, notes, newest-first history, and agent vs super-admin visibility.

## Prerequisites

1. Phase 2 complete: lead lists exist, at least one agent promoted, leads assigned (see `docs/plan-ops-phase2-verify.md`).
2. Migrate schema including `lead_call_attempts` (`npm run db:migrate`).
3. Seed catalogue if needed (`npm run db:seed`).

## Phase 3 checklist

- [ ] Agent opens an **assigned** lead (`/admin/leads/lead/[leadId]`) → logs a call with outcome + notes → entry appears in Call history.
- [ ] History shows **newest first** (datetime, outcome label, agent email, notes).
- [ ] Agent **cannot** open or log on another agent’s lead (404 / not found; no form).
- [ ] Super admin can open **any** lead, log calls, and see **all** history for that lead.

## Log call on assigned lead (detail)

- [ ] Sign in as agent A; open `/admin/leads` → open an assigned lead via its detail link.
- [ ] Contact and Assignment sections show the lead; **Log call** form is present (no dialer / click-to-call).
- [ ] Choose an outcome (`No answer`, `Reached`, `Interested`, `Not interested`, `Callback`, `Wrong number`, `Other`), add notes, submit.
- [ ] Success refreshes the page; Call history shows the new row with outcome label, agent email, and notes.

## Newest-first history (detail)

- [ ] Log a second call with a different outcome (optionally wait a moment so timestamps differ).
- [ ] Call history lists the newer attempt above the older one.
- [ ] Each row shows When (UTC), Outcome, Agent, Notes.

## Agent scope (detail)

- [ ] Lead assigned only to agent B.
- [ ] Agent A cannot open `/admin/leads/lead/[thatLeadId]` (not found) and cannot successfully `logCallAttempt` for it.
- [ ] Agent A’s `/admin/leads` still lists only their own assigned leads.

## Super admin (detail)

- [ ] Super opens any lead (assigned or unassigned) from a list or `/admin/leads/lead/[leadId]`.
- [ ] Super can log a call; history includes attempts logged by agents and by the super.
- [ ] Super can see full history on leads that agents cannot access.
