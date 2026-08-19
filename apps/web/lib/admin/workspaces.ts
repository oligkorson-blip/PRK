import type { StaffRole } from "@/lib/auth/roles";

export type AdminWorkspaceLink = {
  href: string;
  label: string;
};

export type AdminWorkspaceGroup = {
  key: "work" | "platform";
  label: string;
  description: string;
  links: AdminWorkspaceLink[];
};

const coreWorkspaces: AdminWorkspaceLink[] = [
  { href: "/admin/leads", label: "Lead pipeline" },
  { href: "/admin/investors", label: "Investor accounts" },
  { href: "/admin/interests", label: "Investment requests" },
  { href: "/admin/distributions", label: "Payment ledger" },
  { href: "/admin/aml-checklist", label: "Identity and AML checks" },
  { href: "/admin/documents", label: "Document library" }
];

const superAdminWorkspaces: AdminWorkspaceLink[] = [
  { href: "/admin/contracts", label: "Agreements" },
  { href: "/admin/staff", label: "Staff" },
  { href: "/admin/assets", label: "Opportunities" },
  { href: "/admin/platform", label: "Platform settings" },
  { href: "/admin/spaces", label: "Community spaces" }
];

/** Workspace groups shown on the admin overview, preserving staff scope by role. */
export function getAdminWorkspaceGroups(role: StaffRole): AdminWorkspaceGroup[] {
  const groups: AdminWorkspaceGroup[] = [
    {
      key: "work",
      label: "Work",
      description: "Keep investor, lead, payment, and document work moving.",
      links: coreWorkspaces
    }
  ];

  if (role === "super_admin") {
    groups.push({
      key: "platform",
      label: "Platform",
      description: "Manage the people, opportunities, agreements, and settings behind the operation.",
      links: superAdminWorkspaces
    });
  }

  return groups;
}
