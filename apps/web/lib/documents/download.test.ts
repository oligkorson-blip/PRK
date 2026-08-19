import { describe, expect, it } from "vitest";
import { getDownloadMetadata } from "./download";

describe("document download metadata", () => {
  it("normalizes supported content types and removes duplicate extensions", () => {
    expect(
      getDownloadMetadata({
        title: "  Quarterly report.pdf ",
        contentType: " APPLICATION/PDF "
      })
    ).toEqual({
      contentType: "application/pdf",
      filename: "Quarterly_report.pdf"
    });
  });

  it("falls back to an opaque binary download for unknown or malformed types", () => {
    const result = getDownloadMetadata({
      title: "../../private report",
      contentType: "text/html\r\nX-Leak: true"
    });

    expect(result).toEqual({
      contentType: "application/octet-stream",
      filename: "_.._private_report.bin"
    });
    expect(result.filename).not.toMatch(/[\\/\r\n]/);
  });

  it("uses a safe fallback and bounds attacker-controlled titles", () => {
    expect(
      getDownloadMetadata({
        title: "...",
        contentType: "image/png"
      }).filename
    ).toBe("document.png");

    expect(
      getDownloadMetadata({
        title: "a".repeat(200),
        contentType: "image/jpeg"
      }).filename
    ).toBe(`${"a".repeat(120)}.jpg`);
  });
});
