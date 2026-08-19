"use server";

import { db } from "@/lib/db";
import { requireActor, requireSuperActor, type LeadActionResult } from "./shared";
import {
  assignLeadToAgentCore,
  assignLeadToIbCore,
  removeLeadAgentCore,
  removeLeadAssignmentCore,
  type AssignLeadToAgentInput,
  type AssignLeadToIbInput,
  type RemoveLeadAgentInput
} from "./cores";

// Each single-lead action runs its core inside one transaction, like the bulk
// path: the load-then-update + assignment-log writes must be atomic so two
// concurrent assigns can't log a stale `from` or lose a write halfway.
/** Route 1 — Super Admin sends the lead to an IB's unassigned queue. */
export async function assignLeadToIb(input: AssignLeadToIbInput): Promise<LeadActionResult> {
  const actor = await requireSuperActor();
  if (!actor.ok) return actor;
  return db.transaction((tx) => assignLeadToIbCore(tx, actor.staff, input));
}

/** Route 2 — assign directly to an agent; the agent's parent IB is inherited. */
export async function assignLeadToAgent(
  input: AssignLeadToAgentInput
): Promise<LeadActionResult> {
  const actor = await requireActor();
  if (!actor.ok) return actor;
  return db.transaction((tx) => assignLeadToAgentCore(tx, actor.staff, input));
}

/** Remove the agent assignment while keeping the lead under the same IB. */
export async function removeLeadAgent(
  input: RemoveLeadAgentInput
): Promise<LeadActionResult> {
  const actor = await requireActor();
  if (!actor.ok) return actor;
  return db.transaction((tx) => removeLeadAgentCore(tx, actor.staff, input));
}

/** Super Admin only — remove both the IB and the agent assignment. */
export async function removeLeadAssignment(
  input: RemoveLeadAgentInput
): Promise<LeadActionResult> {
  const actor = await requireSuperActor();
  if (!actor.ok) return actor;
  return db.transaction((tx) => removeLeadAssignmentCore(tx, actor.staff, input));
}
