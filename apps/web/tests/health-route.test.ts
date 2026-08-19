import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: { execute: vi.fn() } }));
vi.mock("@/lib/storage/local", () => ({ documentsRoot: vi.fn() }));

import { GET } from "@/app/api/health/route";
import { db } from "@/lib/db";
import { documentsRoot } from "@/lib/storage/local";

let tmpDir: string;

beforeEach(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(db.execute).mockResolvedValue([] as never);
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "parkwise-health-"));
  vi.mocked(documentsRoot).mockReturnValue(tmpDir);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(tmpDir, { recursive: true, force: true });
});

describe("GET /api/health", () => {
  it("returns exactly { ok: true } when db and storage probes pass", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    // e2e/smoke.spec.ts asserts this exact body shape
    expect(await res.json()).toEqual({ ok: true });
    expect(db.execute).toHaveBeenCalledOnce();
  });

  it("returns 503 when the database probe fails", async () => {
    vi.mocked(db.execute).mockRejectedValue(new Error("connection refused"));
    const res = await GET();
    expect(res.status).toBe(503);
    // Generic body — probe details stay server-side (console.error), same as /api/ready.
    expect(await res.json()).toEqual({ ok: false });
    expect(console.error).toHaveBeenCalled();
  });

  it("returns 503 when DOCUMENTS_DIR is not writable", async () => {
    // A root nested under a regular file makes mkdir fail with ENOTDIR
    const file = path.join(tmpDir, "not-a-dir");
    await writeFile(file, "x");
    vi.mocked(documentsRoot).mockReturnValue(path.join(file, "sub"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
  });
});
