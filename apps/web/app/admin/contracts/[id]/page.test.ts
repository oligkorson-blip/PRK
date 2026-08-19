import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("admin agreement record", () => {
  it("requires a super admin and keeps malformed records on the not-found path", () => {
    const src = readFileSync(path.join(root, "app/admin/contracts/[id]/page.tsx"), "utf8");

    expect(src).toContain("requireSuperAdmin");
    expect(src).toContain("if (!isUuid(id)) notFound()");
    expect(src).toContain("getContractForAdmin");
  });

  it("shows signer state, lifecycle audit, and verified signature receipts", () => {
    const src = readFileSync(path.join(root, "app/admin/contracts/[id]/page.tsx"), "utf8");

    expect(src).toContain("Current signer state");
    expect(src).toContain("Lifecycle transition audit");
    expect(src).toContain("Verified signature events");
    expect(src).toContain("contract.transitions.map");
    expect(src).toContain("contract.signatureEvents.map");
    expect(src).toContain("Provider signer ID");
    expect(src).toContain('event.providerSignerId ?? "—"');
  });
  it("exposes the manual signing workflow without replacing provider receipts", () => {
    const src = readFileSync(path.join(root, "app/admin/contracts/[id]/page.tsx"), "utf8");

    expect(src).toContain("Manual signing");
    expect(src).toContain("ManualContractSignatureForm");
    expect(src).toContain("Verified signature events");
  });

});
