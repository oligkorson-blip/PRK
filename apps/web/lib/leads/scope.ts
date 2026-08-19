import type { StaffRole } from "@/lib/auth/roles";

export function leadVisibleToStaff(input: {
  role: StaffRole;
  staffId: string;
  lead: { assignedAgentId: string | null; ibId: string | null };
}): boolean {
  if (input.role === "super_admin") return true;
  // An IB sees its unassigned queue plus every lead owned by its team.
  if (input.role === "ib") return input.lead.ibId === input.staffId;
  return input.lead.assignedAgentId === input.staffId;
}

export function leadManageableByIb(input: {
  role: StaffRole;
  staffId: string;
  lead: { ibId: string | null };
}): boolean {
  return input.role === "ib" && input.lead.ibId === input.staffId;
}
