import type { StaffRole } from "@/lib/auth/roles";
import { investorVisibleToStaff } from "@/lib/auth/staff";

export type DocumentAccessRow = {
  ownerType: "asset" | "holding" | "platform" | "investor";
  ownerId: string | null;
};

export function canAccessDocument(input: {
  doc: DocumentAccessRow;
  investorId: string;
  /** Asset IDs the investor has an interest or holding on */
  relatedAssetIds: Set<string>;
  /** Holding IDs owned by the investor */
  ownedHoldingIds: Set<string>;
}): boolean {
  const { doc, investorId, relatedAssetIds, ownedHoldingIds } = input;
  if (doc.ownerType === "platform") return true;
  if (doc.ownerType === "investor") {
    return doc.ownerId === investorId;
  }
  if (doc.ownerType === "asset") {
    return doc.ownerId != null && relatedAssetIds.has(doc.ownerId);
  }
  if (doc.ownerType === "holding") {
    return doc.ownerId != null && ownedHoldingIds.has(doc.ownerId);
  }
  return false;
}

/** Admin/staff gate: agents only see holding/investor docs for their assigned investors. */
export function staffCanAccessAdminDocument(input: {
  role: StaffRole;
  staffId: string;
  doc: DocumentAccessRow;
  /** Holding owner's assignment; ignored for asset/platform */
  holdingOwner?: { assignedAgentId?: string | null; ibId?: string | null };
  /** Investor's assignment when ownerType is investor */
  investorOwner?: { assignedAgentId?: string | null; ibId?: string | null };
}): boolean {
  if (input.role === "super_admin") return true;
  if (input.doc.ownerType === "platform" || input.doc.ownerType === "asset") return true;
  if (input.doc.ownerType === "investor") {
    if (input.doc.ownerId == null) return false;
    return investorVisibleToStaff({
      role: input.role,
      staffId: input.staffId,
      investor: {
        assignedAgentId: input.investorOwner?.assignedAgentId ?? null,
        ibId: input.investorOwner?.ibId ?? null
      }
    });
  }
  if (input.doc.ownerType !== "holding" || input.doc.ownerId == null) return false;
  return investorVisibleToStaff({
    role: input.role,
    staffId: input.staffId,
    investor: {
      assignedAgentId: input.holdingOwner?.assignedAgentId ?? null,
      ibId: input.holdingOwner?.ibId ?? null
    }
  });
}
