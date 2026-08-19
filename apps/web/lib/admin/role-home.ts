import type { StaffRole } from "@/lib/auth/roles";

export type AdminRoleHomeLink = { href: string; label: string };

export type AdminRoleHome = {
  title: string;
  subtitle: string;
  primaryLinks: AdminRoleHomeLink[];
};

/** Role-specific framing for the /admin home — same shell, different priority. */
export function getAdminRoleHome(role: StaffRole): AdminRoleHome {
  if (role === "agent") {
    return {
      title: "Your book",
      subtitle: "Work assigned leads and investors through identity, requests, and follow-ups.",
      primaryLinks: [
        { href: "/admin/leads", label: "Lead pipeline" },
        { href: "/admin/investors", label: "Investors" },
        { href: "/admin/interests", label: "Investment requests" }
      ]
    };
  }
  if (role === "ib") {
    return {
      title: "Team queue",
      subtitle: "Keep your agents’ book moving — leads, requests, and overdue follow-ups.",
      primaryLinks: [
        { href: "/admin/leads", label: "Lead pipeline" },
        { href: "/admin/interests", label: "Investment requests" },
        { href: "/admin/aml-checklist", label: "AML checklist" }
      ]
    };
  }
  return {
    title: "Operations",
    subtitle: "Clear gates, confirm requests, and keep the book healthy.",
    primaryLinks: [
      { href: "/admin/interests", label: "Investment requests" },
      { href: "/admin/aml-checklist", label: "AML checklist" },
      { href: "/admin/contracts", label: "Agreements" },
      { href: "/admin/platform", label: "Platform settings" }
    ]
  };
}
