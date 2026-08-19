import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/staff", () => ({ getStaffContext: vi.fn() }));

import { resolvePostSignInDestination } from "@/lib/auth/post-sign-in-actions";
import { getStaffContext } from "@/lib/auth/staff";

describe("resolvePostSignInDestination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends staff to the admin console", async () => {
    vi.mocked(getStaffContext).mockResolvedValue({
      user: { id: "u1", email: "ops@parkwise.test" },
      staff: { id: "s1", role: "super_admin", ibId: null },
      role: "super_admin"
    });

    await expect(resolvePostSignInDestination()).resolves.toBe("/admin");
  });

  it("sends investors to the portal", async () => {
    vi.mocked(getStaffContext).mockResolvedValue(null);

    await expect(resolvePostSignInDestination()).resolves.toBe("/portal");
  });
});
