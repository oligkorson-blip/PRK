import { describe, expect, it } from "vitest";
import { sniffMatchesType } from "@/lib/storage/sniff";

function fileFromBytes(bytes: number[]): File {
  return new File([new Uint8Array(bytes)], "sample.bin");
}

const PDF_HEAD = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]; // %PDF-1.7
const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00];

describe("sniffMatchesType", () => {
  it("accepts content matching the declared type", async () => {
    await expect(sniffMatchesType(fileFromBytes(PDF_HEAD), "application/pdf")).resolves.toBe(true);
    await expect(sniffMatchesType(fileFromBytes(JPEG_HEAD), "image/jpeg")).resolves.toBe(true);
    await expect(sniffMatchesType(fileFromBytes(PNG_HEAD), "image/png")).resolves.toBe(true);
  });

  it("rejects content that does not match the declared type", async () => {
    // HTML/JS payload labeled as each allowed type
    const html = [0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e, 0x3c, 0x73, 0x63, 0x72]; // <html><scr
    await expect(sniffMatchesType(fileFromBytes(html), "application/pdf")).resolves.toBe(false);
    await expect(sniffMatchesType(fileFromBytes(html), "image/jpeg")).resolves.toBe(false);
    await expect(sniffMatchesType(fileFromBytes(html), "image/png")).resolves.toBe(false);
  });

  it("rejects valid magic bytes declared as a different allowed type", async () => {
    await expect(sniffMatchesType(fileFromBytes(PNG_HEAD), "application/pdf")).resolves.toBe(false);
    await expect(sniffMatchesType(fileFromBytes(PDF_HEAD), "image/png")).resolves.toBe(false);
    await expect(sniffMatchesType(fileFromBytes(JPEG_HEAD), "image/png")).resolves.toBe(false);
  });

  it("rejects truncated files shorter than the magic signature", async () => {
    await expect(sniffMatchesType(fileFromBytes([0x25, 0x50]), "application/pdf")).resolves.toBe(
      false
    );
    await expect(sniffMatchesType(fileFromBytes([]), "image/png")).resolves.toBe(false);
  });

  it("rejects unsupported declared types even with valid content", async () => {
    await expect(sniffMatchesType(fileFromBytes(PDF_HEAD), "text/html")).resolves.toBe(false);
    await expect(sniffMatchesType(fileFromBytes(PDF_HEAD), "")).resolves.toBe(false);
  });

  it("ignores bytes beyond the signature", async () => {
    const pdfWithJunkTail = [...PDF_HEAD, 0x00, 0xff, 0x3c, 0x3e];
    await expect(sniffMatchesType(fileFromBytes(pdfWithJunkTail), "application/pdf")).resolves.toBe(
      true
    );
  });
});
