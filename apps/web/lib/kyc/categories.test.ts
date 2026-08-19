import { describe, expect, it } from "vitest";
import { KYC_CATEGORY_LABEL } from "./categories";

describe("KYC document categories", () => {
  it("keeps source of funds available as a named optional category", () => {
    expect(KYC_CATEGORY_LABEL.kyc_source_funds).toBe("Source of funds");
  });
});
