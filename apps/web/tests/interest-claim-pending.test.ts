import { describe, expect, it } from "vitest";
import { interpretPendingClaim } from "@/lib/interests/claim-pending";

describe("interpretPendingClaim", () => {
  it("treats a single returned row as a successful claim", () => {
    expect(interpretPendingClaim([{ id: "a" }])).toEqual({ claimed: true });
  });

  it("treats zero rows as a lost race or already-decided interest", () => {
    expect(interpretPendingClaim([])).toEqual({ claimed: false });
  });
});
