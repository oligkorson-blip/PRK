import { describe, expect, it } from "vitest";
import {
  LEADS_CSV_HEADERS,
  leadsCsvTemplateContent,
  parseLeadsCsv,
} from "@/lib/leads/csv";

describe("leads CSV template", () => {
  it("uses the expected header columns", () => {
    expect(LEADS_CSV_HEADERS).toEqual([
      "full_name",
      "email",
      "phone",
      "source",
      "source_detail",
      "notes",
    ]);

    const content = leadsCsvTemplateContent();
    const headerLine = content.trim().split("\n")[0];
    expect(headerLine).toBe(LEADS_CSV_HEADERS.join(","));
  });

  it("includes one example data row", () => {
    const lines = leadsCsvTemplateContent().trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("@");
  });
});

describe("parseLeadsCsv", () => {
  it("parses a valid row", () => {
    const text = [
      LEADS_CSV_HEADERS.join(","),
      "Ada Lovelace,ADA@Example.com,555-0100,referral,friend,VIP",
    ].join("\n");

    const result = parseLeadsCsv(text, { defaultSource: "import" });

    expect(result.errors).toEqual([]);
    expect(result.ok).toEqual([
      {
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        phone: "555-0100",
        source: "referral",
        sourceDetail: "friend",
        notes: "VIP",
      },
    ]);
  });

  it("rejects a row with missing email", () => {
    const text = [
      LEADS_CSV_HEADERS.join(","),
      "Ada Lovelace,,555-0100,referral,,",
    ].join("\n");

    const result = parseLeadsCsv(text, { defaultSource: "import" });

    expect(result.ok).toEqual([]);
    expect(result.errors).toEqual([
      { line: 2, message: expect.stringMatching(/email/i) },
    ]);
  });

  it("falls back to defaultSource when source cell is empty", () => {
    const text = [
      LEADS_CSV_HEADERS.join(","),
      "Ada Lovelace,ada@example.com,,,,",
    ].join("\n");

    const result = parseLeadsCsv(text, { defaultSource: "csv-upload" });

    expect(result.errors).toEqual([]);
    expect(result.ok).toHaveLength(1);
    expect(result.ok[0].source).toBe("csv-upload");
    expect(result.ok[0].phone).toBeNull();
    expect(result.ok[0].sourceDetail).toBeNull();
    expect(result.ok[0].notes).toBeNull();
  });

  it("keeps commas inside quoted fields", () => {
    const text = [
      LEADS_CSV_HEADERS.join(","),
      'Ada Lovelace,ada@example.com,555-0100,referral,friend,"VIP, follow up"',
    ].join("\n");

    const result = parseLeadsCsv(text, { defaultSource: "import" });

    expect(result.errors).toEqual([]);
    expect(result.ok).toHaveLength(1);
    expect(result.ok[0].notes).toBe("VIP, follow up");
  });

  it("unescapes doubled quotes inside quoted fields", () => {
    const text = [
      LEADS_CSV_HEADERS.join(","),
      '"Ada ""The Countess"" Lovelace",ada@example.com,,,,',
    ].join("\n");

    const result = parseLeadsCsv(text, { defaultSource: "import" });

    expect(result.errors).toEqual([]);
    expect(result.ok).toHaveLength(1);
    expect(result.ok[0].fullName).toBe('Ada "The Countess" Lovelace');
  });

  it("ignores a UTF-8 BOM before the header row", () => {
    const text =
      "\uFEFF" +
      [
        LEADS_CSV_HEADERS.join(","),
        "Ada Lovelace,ada@example.com,,,,",
      ].join("\n");

    const result = parseLeadsCsv(text, { defaultSource: "import" });

    expect(result.errors).toEqual([]);
    expect(result.ok).toHaveLength(1);
    expect(result.ok[0].email).toBe("ada@example.com");
  });

  it("keeps an embedded newline inside a quoted cell as one row", () => {
    const text = [
      LEADS_CSV_HEADERS.join(","),
      'Ada Lovelace,ada@example.com,555-0100,referral,friend,"Line one\nLine two"',
      "Grace Hopper,grace@example.com,,referral,,",
    ].join("\n");

    const result = parseLeadsCsv(text, { defaultSource: "import" });

    expect(result.errors).toEqual([]);
    expect(result.ok).toHaveLength(2);
    expect(result.ok[0].notes).toBe("Line one\nLine two");
    expect(result.ok[1].fullName).toBe("Grace Hopper");
  });

  it("keeps an embedded CRLF inside a quoted cell as one row", () => {
    const text = [
      LEADS_CSV_HEADERS.join(","),
      'Ada Lovelace,ada@example.com,,referral,,"Line one\r\nLine two"',
      "Grace Hopper,grace@example.com,,referral,,",
    ].join("\r\n");

    const result = parseLeadsCsv(text, { defaultSource: "import" });

    expect(result.errors).toEqual([]);
    expect(result.ok).toHaveLength(2);
    expect(result.ok[0].notes).toBe("Line one\r\nLine two");
  });

  it("rejects malformed emails that merely contain an @", () => {
    const text = [
      LEADS_CSV_HEADERS.join(","),
      "Ada Lovelace,ada@example,555-0100,referral,,",
      "Grace Hopper,grace @example.com,,referral,,",
    ].join("\n");

    const result = parseLeadsCsv(text, { defaultSource: "import" });

    expect(result.ok).toEqual([]);
    expect(result.errors).toEqual([
      { line: 2, message: expect.stringMatching(/email/i) },
      { line: 3, message: expect.stringMatching(/email/i) },
    ]);
  });

  it("accepts CRLF line endings", () => {
    const text =
      [LEADS_CSV_HEADERS.join(","), "Ada Lovelace,ada@example.com,,,,"].join(
        "\r\n"
      ) + "\r\n";

    const result = parseLeadsCsv(text, { defaultSource: "import" });

    expect(result.errors).toEqual([]);
    expect(result.ok).toHaveLength(1);
    expect(result.ok[0].fullName).toBe("Ada Lovelace");
  });
});
