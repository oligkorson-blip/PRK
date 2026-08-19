import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/documents/queries", () => ({
  assertInvestorCanDownload: vi.fn(),
  assertStaffCanDownload: vi.fn(),
  recordDocumentDownload: vi.fn()
}));
vi.mock("@/lib/auth/staff", () => ({ getStaffContext: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/storage/local", () => ({
  isStorageConfigured: vi.fn(),
  readObject: vi.fn()
}));

import { GET } from "@/app/api/documents/[id]/download/route";
import { getSessionUser } from "@/lib/auth/session";
import { getStaffContext } from "@/lib/auth/staff";
import { assertStaffCanDownload, recordDocumentDownload } from "@/lib/documents/queries";
import { isStorageConfigured, readObject } from "@/lib/storage/local";

const ctx = { params: Promise.resolve({ id: "doc-1" }) };
const req = new Request("https://example.com/api/documents/doc-1/download");

describe("GET /api/documents/[id]/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("checks auth before storage config — no anonymous storage probe", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    vi.mocked(isStorageConfigured).mockReturnValue(false);

    const res = await GET(req, ctx);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthenticated" });
  });

  it("returns 503 to authenticated callers when storage is not configured", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(isStorageConfigured).mockReturnValue(false);

    const res = await GET(req, ctx);

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Storage not configured" });
  });

  it("serves document bytes with no-store, private cache control", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "user-1", email: "sara@example.com" } as never);
    vi.mocked(isStorageConfigured).mockReturnValue(true);
    vi.mocked(getStaffContext).mockResolvedValue({ staff: { id: "staff-1" } } as never);
    vi.mocked(assertStaffCanDownload).mockResolvedValue({
      doc: {
        id: "doc-1",
        title: "Statement.pdf",
        contentType: "application/pdf",
        storageKey: "stored-key"
      }
    } as never);
    vi.mocked(readObject).mockResolvedValue(Buffer.from("pdf-bytes"));

    const res = await GET(req, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store, private");
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain('filename="Statement.pdf"');
    expect(await res.text()).toBe("pdf-bytes");
    expect(readObject).toHaveBeenCalledWith("stored-key");
    expect(recordDocumentDownload).toHaveBeenCalledWith({
      actorUserId: "user-1",
      documentId: "doc-1"
    });
  });
});
