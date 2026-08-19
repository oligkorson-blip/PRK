import type { StaffRole } from "@/lib/auth/roles";
import { investorVisibleToStaff } from "@/lib/auth/staff";

export function authUserVisibleToStaff(input: {
  role: StaffRole;
  staffId: string;
  target:
    | { kind: "investor"; assignedAgentId: string | null; ibId: string | null }
    | { kind: "staff" };
}): boolean {
  if (input.target.kind === "staff") {
    return input.role === "super_admin";
  }
  return investorVisibleToStaff({
    role: input.role,
    staffId: input.staffId,
    investor: { assignedAgentId: input.target.assignedAgentId, ibId: input.target.ibId }
  });
}
