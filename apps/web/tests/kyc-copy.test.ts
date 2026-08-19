import { describe, expect, it } from "vitest";

import {
  KYC_COMPANY_REQUIREMENTS,
  KYC_DOCUMENT_CHANGE_ERROR,
  KYC_DOCUMENTS_LOCKED,
  KYC_DOCUMENT_SAVE_ERROR,
  KYC_SUBMIT_CONNECTION_ERROR,
  KYC_UPLOADS_ACTIVE_ONLY,
  KYC_UPLOAD_CONNECTION_ERROR,
  KYC_UPLOAD_UNAVAILABLE
} from "@/lib/copy/kyc";

describe("identity-check copy", () => {
  it("keeps upload and submission errors actionable", () => {
    const messages = [
      KYC_UPLOAD_UNAVAILABLE,
      KYC_UPLOAD_CONNECTION_ERROR,
      KYC_DOCUMENT_SAVE_ERROR,
      KYC_DOCUMENT_CHANGE_ERROR,
      KYC_SUBMIT_CONNECTION_ERROR
    ];

    for (const message of messages) {
      expect(message).toMatch(/try again|contact the team/i);
      expect(message).not.toMatch(/storage|configured|offline/i);
    }
  });

  it("uses calm portal language for account and review states", () => {
    expect(KYC_UPLOADS_ACTIVE_ONLY).toBe(
      "Document uploads become available once your account is active."
    );
    expect(KYC_DOCUMENTS_LOCKED).toBe(
      "Your documents are with our team for review. If you need to make a change, contact the team."
    );
    expect(KYC_COMPANY_REQUIREMENTS).toContain("company account");
    expect(KYC_COMPANY_REQUIREMENTS).not.toContain("pack");
  });
});
