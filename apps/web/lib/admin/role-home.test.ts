import { describe, expect, it } from "vitest";
import { getAdminRoleHome } from "@/lib/admin/role-home";

describe("getAdminRoleHome", () => {
  it("focuses agents on their assigned book", () => {
    const home = getAdminRoleHome("agent");
    expect(home.title).toMatch(/your book/i);
    expect(home.primaryLinks[0]?.href).toBe("/admin/leads");
  });

  it("focuses IBs on the team queue", () => {
    const home = getAdminRoleHome("ib");
    expect(home.title).toMatch(/team/i);
    expect(home.primaryLinks.some((l) => l.href === "/admin/leads")).toBe(true);
  });

  it("gives super admins the full ops home", () => {
    const home = getAdminRoleHome("super_admin");
    expect(home.title).toBe("Operations");
    expect(home.primaryLinks.some((l) => l.href === "/admin/interests")).toBe(true);
    expect(home.primaryLinks.some((l) => l.href === "/admin/platform")).toBe(true);
  });
});
