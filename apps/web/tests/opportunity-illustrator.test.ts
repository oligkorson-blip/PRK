import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const returnsComponent = path.join(
  process.cwd(),
  "components/opportunity-detail-returns.tsx"
);

describe("opportunity return illustrator", () => {
  it("starts at the selected minimum instead of showing an initial error", () => {
    const src = readFileSync(returnsComponent, "utf8");

    expect(src).toContain(
      "const [illustrativeAmountRaw, setIllustrativeAmountRaw] = useState(() =>"
    );
    expect(src).toContain(
      'selected ? String(selected.minTicketEur) : ""'
    );
    expect(src).toContain("aria-invalid={!amountIsValid}");
  });
});
