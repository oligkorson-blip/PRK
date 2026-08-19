import { describe, expect, it } from "vitest";
import {
  formatInvestorActivityLine,
  mergeActivityItems,
  type InvestorActivityEventRow,
  type InvestorActivityNoteRow
} from "@/lib/investors/activity";

describe("formatInvestorActivityLine", () => {
  it("maps known actions to friendly lines", () => {
    expect(formatInvestorActivityLine("investor.created", {})).toBe("Investor record created");
    expect(formatInvestorActivityLine("investor.assigned", {})).toBe("Assigned to an agent");
    expect(formatInvestorActivityLine("investor.invited", {})).toBe("Portal invite sent");
    expect(formatInvestorActivityLine("investor.note_added", {})).toBe("Note added");
    expect(formatInvestorActivityLine("investor.two_factor_reset", {})).toBe("Two-factor authentication reset");
    expect(formatInvestorActivityLine("investor.password_set", {})).toBe("Password set");
    expect(formatInvestorActivityLine("investor.erased", {})).toBe("Investor data erased (GDPR)");
    expect(formatInvestorActivityLine("application.submitted", {})).toBe("Application submitted");
    expect(formatInvestorActivityLine("application.contacted", {})).toBe("Applicant contacted");
    expect(formatInvestorActivityLine("application.rejected", {})).toBe("Application rejected");
    expect(formatInvestorActivityLine("kyc.document_uploaded", {})).toBe("KYC document uploaded");
    expect(formatInvestorActivityLine("kyc.submitted", {})).toBe("KYC submitted for review");
    expect(formatInvestorActivityLine("kyc.approved", {})).toBe("KYC approved");
    expect(formatInvestorActivityLine("kyc.rejected", {})).toBe("KYC rejected");
    expect(formatInvestorActivityLine("kyc.assisted_upload", {})).toBe("KYC document uploaded by staff");
    expect(formatInvestorActivityLine("onboarding.completed", {})).toBe("Onboarding completed");
    expect(formatInvestorActivityLine("onboarding.assisted_profile_saved", {})).toBe("Profile saved by staff");
    expect(formatInvestorActivityLine("onboarding.assisted_completed", {})).toBe("Onboarding completed by staff");
    expect(formatInvestorActivityLine("aml.screening_recorded", {})).toBe("AML screening recorded");
  });

  it("humanizes unknown actions instead of showing a raw enum string", () => {
    expect(formatInvestorActivityLine("investor.future_thing", {})).toBe("Investor future thing");
  });
});

describe("mergeActivityItems", () => {
  const events: InvestorActivityEventRow[] = [
    { id: "e1", action: "investor.created", createdAt: new Date("2026-01-01T10:00:00Z"), payload: {} },
    { id: "e2", action: "kyc.approved", createdAt: new Date("2026-01-03T10:00:00Z"), payload: {} }
  ];
  const notes: InvestorActivityNoteRow[] = [
    { id: "n1", body: "Called about ticket size", authorEmail: "agent@example.com", createdAt: new Date("2026-01-02T10:00:00Z") }
  ];

  it("merges events and notes newest-first", () => {
    const items = mergeActivityItems(events, notes);
    expect(items.map((i) => i.id)).toEqual(["e2", "n1", "e1"]);
    expect(items[1]).toMatchObject({
      kind: "note",
      body: "Called about ticket size",
      authorEmail: "agent@example.com",
      line: "Note added"
    });
    expect(items[0]).toMatchObject({ kind: "event", line: "KYC approved", body: null });
  });

  it("handles empty inputs", () => {
    expect(mergeActivityItems([], [])).toEqual([]);
  });
});
