import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/staff", () => ({
  requireStaff: vi.fn(),
  requireSuperAdmin: vi.fn()
}));
vi.mock("@/lib/db", () => {
  const db = {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    // Mutation + audit pairs run in a transaction; delegate to the same mocks.
    transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(db))
  };
  return { db, assets: {}, auditEvents: {}, interests: {} };
});

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/staff";
import { db } from "@/lib/db";
import { createAsset, setAssetStatus, updateAssetImages, updateDraftAsset } from "@/lib/assets/admin-actions";
import type { AssetFormInput } from "@/lib/assets/asset-form";

const insertMock = db.insert as unknown as ReturnType<typeof vi.fn>;
const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;
const updateMock = db.update as unknown as ReturnType<typeof vi.fn>;
const transactionMock = db.transaction as unknown as ReturnType<typeof vi.fn>;

function validInput(overrides: Partial<AssetFormInput> = {}): AssetFormInput {
  return {
    name: "Lisbon Airport Parking",
    city: "Lisbon",
    country: "Portugal",
    siteType: "airport",
    spaces: "420",
    occupancyPct: "86.5",
    operator: "ParkOperator Lda",
    term: "12 years",
    paymentFrequency: "monthly",
    advisoryCapacityEur: "1500000",
    description: "Busy airport car park next to the terminal.",
    coverImageUrl: "",
    placeStory: "",
    operatorStory: "",
    demandStory: "",
    numbersNote: "",
    visitorsProvenance: "withheld",
    revenueProvenance: "withheld",
    incomeMix: [
      { id: "vehicle_parking", pct: "80" },
      { id: "ev_charging", pct: "20" }
    ],
    standardMinTicketEur: "9900",
    standardYieldPct: "7.7",
    premiumEnabled: false,
    premiumMinTicketEur: "",
    premiumYieldPct: "",
    greenEnabled: false,
    greenMinTicketEur: "",
    greenYieldPct: "",
    ...overrides
  };
}

describe("createAsset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      user: { id: "user-1", email: "admin@example.com" },
      staff: { id: "staff-1", role: "super_admin", ibId: null },
      role: "super_admin"
    });
  });

  it("returns Forbidden when the caller is not a super admin", async () => {
    vi.mocked(requireSuperAdmin).mockRejectedValue(new Error("FORBIDDEN"));

    const result = await createAsset(validInput());

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("rejects invalid input without touching the database", async () => {
    const result = await createAsset(validInput({ name: " " }));

    expect(result).toEqual({ ok: false, error: "Name is required." });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("creates a draft asset and writes the asset.created audit event", async () => {
    const valuesSpy = vi.fn(() => ({
      returning: () => Promise.resolve([{ id: "asset-1" }])
    }));
    insertMock.mockImplementationOnce(() => ({ values: valuesSpy }));
    const auditValues = vi.fn();
    insertMock.mockImplementationOnce(() => ({ values: auditValues }));

    const result = await createAsset(validInput());

    expect(result).toEqual({ ok: true, assetId: "asset-1" });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(valuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "lisbon-airport-parking",
        name: "Lisbon Airport Parking",
        status: "draft",
        targetYieldPct: "7.70",
        minTicketEur: 9900,
        spaces: 420,
        occupancyPct: "86.50",
        leaseLabel: "12 years"
      })
    );
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user-1",
        action: "asset.created",
        entityType: "asset",
        entityId: "asset-1"
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin/assets");
    expect(revalidatePath).toHaveBeenCalledWith("/opportunities");
  });

  it("does not revalidate when the asset audit insert fails inside the transaction", async () => {
    insertMock.mockImplementationOnce(() => ({
      values: () => ({
        returning: () => Promise.resolve([{ id: "asset-1" }])
      })
    }));
    insertMock.mockImplementationOnce(() => ({
      values: () => Promise.reject(new Error("audit unavailable"))
    }));

    await expect(createAsset(validInput())).rejects.toThrow("audit unavailable");

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("maps a slug unique violation to a friendly error", async () => {
    const duplicate = Object.assign(new Error("duplicate key value"), { code: "23505" });
    insertMock.mockImplementationOnce(() => ({
      values: () => ({ returning: () => Promise.reject(duplicate) })
    }));

    const result = await createAsset(validInput());

    expect(result).toEqual({
      ok: false,
      error: "An opportunity with a similar name already exists."
    });
    expect(insertMock).toHaveBeenCalledTimes(1); // no audit insert
  });
});

/** Queue one db.select chain resolving to `rows`. */
function mockSelect(rows: unknown) {
  selectMock.mockImplementationOnce(() => ({
    from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) })
  }));
}

describe("updateDraftAsset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      user: { id: "user-1", email: "admin@example.com" },
      staff: { id: "staff-1", role: "super_admin", ibId: null },
      role: "super_admin"
    });
  });

  it("returns Forbidden when the caller is not a super admin", async () => {
    vi.mocked(requireSuperAdmin).mockRejectedValue(new Error("FORBIDDEN"));

    const result = await updateDraftAsset({ assetId: "asset-1", form: validInput() });

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns an error when the asset does not exist", async () => {
    mockSelect([]);

    const result = await updateDraftAsset({ assetId: "missing", form: validInput() });

    expect(result).toEqual({ ok: false, error: "Asset not found." });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("refuses to edit a published asset", async () => {
    mockSelect([{ id: "asset-1", status: "published", slug: "lisbon-airport-parking" }]);

    const result = await updateDraftAsset({ assetId: "asset-1", form: validInput() });

    expect(result).toEqual({
      ok: false,
      error: "Only draft opportunities can be edited."
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects invalid input without updating", async () => {
    mockSelect([{ id: "asset-1", status: "draft", slug: "lisbon-airport-parking" }]);

    const result = await updateDraftAsset({
      assetId: "asset-1",
      form: validInput({ name: " " })
    });

    expect(result).toEqual({ ok: false, error: "Name is required." });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("updates the draft and writes the asset.updated audit event", async () => {
    mockSelect([{ id: "asset-1", status: "draft", slug: "lisbon-airport-parking" }]);
    const setSpy = vi.fn((_values: Record<string, unknown>) => ({
      where: () => ({ returning: () => Promise.resolve([{ id: "asset-1" }]) })
    }));
    updateMock.mockImplementationOnce(() => ({ set: setSpy }));
    const auditValues = vi.fn();
    insertMock.mockImplementationOnce(() => ({ values: auditValues }));

    const result = await updateDraftAsset({
      assetId: "asset-1",
      form: validInput({ name: "Lisbon Airport Parking — Terminal 2" })
    });

    expect(result).toEqual({ ok: true });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Lisbon Airport Parking — Terminal 2",
        spaces: 420,
        occupancyPct: "86.50",
        leaseLabel: "12 years"
      })
    );
    // Slug is identity: a rename must not rewrite it.
    expect(setSpy.mock.calls[0]![0]).not.toHaveProperty("slug");
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user-1",
        action: "asset.updated",
        entityType: "asset",
        entityId: "asset-1"
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin/assets");
    expect(revalidatePath).toHaveBeenCalledWith("/opportunities/lisbon-airport-parking");
  });

  it("does not revalidate when the draft-update audit insert fails inside the transaction", async () => {
    mockSelect([{ id: "asset-1", status: "draft", slug: "lisbon-airport-parking" }]);
    updateMock.mockImplementationOnce(() => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([{ id: "asset-1" }])
        })
      })
    }));
    insertMock.mockImplementationOnce(() => ({
      values: () => Promise.reject(new Error("audit unavailable"))
    }));

    await expect(
      updateDraftAsset({ assetId: "asset-1", form: validInput() })
    ).rejects.toThrow("audit unavailable");

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("setAssetStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      user: { id: "user-1", email: "admin@example.com" },
      staff: { id: "staff-1", role: "super_admin", ibId: null },
      role: "super_admin"
    });
  });

  it("returns Forbidden when the caller is not a super admin", async () => {
    vi.mocked(requireSuperAdmin).mockRejectedValue(new Error("FORBIDDEN"));

    const result = await setAssetStatus({ assetId: "asset-1", status: "published" });

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("refuses to publish a draft that still has placeholder stats", async () => {
    // Legacy drafts may still carry spaces: 0 / occupancyPct: "0.00".
    mockSelect([{ id: "asset-1", status: "draft", spaces: 0, occupancyPct: "0.00" }]);

    const result = await setAssetStatus({ assetId: "asset-1", status: "published" });

    expect(result).toEqual({
      ok: false,
      error: "Set parking spaces and occupancy before publishing."
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("refuses to publish when only one of the placeholder stats is refined", async () => {
    mockSelect([{ id: "asset-1", status: "draft", spaces: 0, occupancyPct: "95.00" }]);

    const result = await setAssetStatus({ assetId: "asset-1", status: "published" });

    expect(result).toEqual({
      ok: false,
      error: "Set parking spaces and occupancy before publishing."
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it.each([
    { spaces: -1, occupancyPct: "95.00" },
    { spaces: 620, occupancyPct: "-1.00" },
    { spaces: 620, occupancyPct: "101.00" },
    { spaces: 620, occupancyPct: "not-a-number" }
  ])("refuses to publish an invalid operating profile: %o", async (profile) => {
    mockSelect([{ id: "asset-1", status: "draft", ...profile }]);

    const result = await setAssetStatus({ assetId: "asset-1", status: "published" });

    expect(result).toEqual({
      ok: false,
      error: "Set parking spaces and occupancy before publishing."
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("publishes a draft with real stats and writes the audit event", async () => {
    // Seeded-style asset: real figures, like the catalogue rows in seed-data.json.
    mockSelect([{ id: "asset-1", status: "draft", spaces: 620, occupancyPct: "96.40" }]);
    const setSpy = vi.fn((_values: Record<string, unknown>) => ({
      where: () => ({
        returning: () => Promise.resolve([{ id: "asset-1" }])
      })
    }));
    updateMock.mockImplementationOnce(() => ({ set: setSpy }));
    const auditValues = vi.fn();
    insertMock.mockImplementationOnce(() => ({ values: auditValues }));

    const result = await setAssetStatus({ assetId: "asset-1", status: "published" });

    expect(result).toEqual({ ok: true });
    expect(transactionMock).toHaveBeenCalledTimes(1); // mutation + audit are atomic
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: "published" })
    );
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user-1",
        action: "asset.status_changed",
        entityType: "asset",
        entityId: "asset-1"
      })
    );
  });

  it("does not overwrite a newer status when the validated state is stale", async () => {
    mockSelect([{ id: "asset-1", status: "draft", spaces: 620, occupancyPct: "96.40" }]);
    updateMock.mockImplementationOnce(() => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([])
        })
      })
    }));

    const result = await setAssetStatus({ assetId: "asset-1", status: "published" });

    expect(result).toEqual({
      ok: false,
      error: "This opportunity changed while you were updating it. Refresh and try again."
    });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(insertMock).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("still allows unpublishing an asset with placeholder stats", async () => {
    mockSelect([{ id: "asset-1", status: "published", spaces: 0, occupancyPct: "0.00" }]);
    mockSelect([]); // no pending interests
    updateMock.mockImplementationOnce(() => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([{ id: "asset-1" }])
        })
      })
    }));
    insertMock.mockImplementationOnce(() => ({ values: vi.fn() }));

    const result = await setAssetStatus({ assetId: "asset-1", status: "draft" });

    expect(result).toEqual({ ok: true });
  });

  it("treats closed as terminal — no closed -> published", async () => {
    mockSelect([{ id: "asset-1", status: "closed", spaces: 620, occupancyPct: "96.40" }]);

    const result = await setAssetStatus({ assetId: "asset-1", status: "published" });

    expect(result).toEqual({
      ok: false,
      error: "A closed opportunity cannot be reopened."
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("treats closed as terminal — no closed -> draft", async () => {
    mockSelect([{ id: "asset-1", status: "closed", spaces: 620, occupancyPct: "96.40" }]);

    const result = await setAssetStatus({ assetId: "asset-1", status: "draft" });

    expect(result).toEqual({
      ok: false,
      error: "A closed opportunity cannot be reopened."
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("blocks published -> draft while pending interests reference the terms", async () => {
    mockSelect([{ id: "asset-1", status: "published", spaces: 620, occupancyPct: "96.40" }]);
    mockSelect([{ id: "interest-1" }]); // pending interest on this asset

    const result = await setAssetStatus({ assetId: "asset-1", status: "draft" });

    expect(result).toEqual({
      ok: false,
      error: "Resolve pending interests before unpublishing."
    });
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("updateAssetImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      user: { id: "user-1", email: "admin@example.com" },
      staff: { id: "staff-1", role: "super_admin", ibId: null },
      role: "super_admin"
    });
  });

  it("persists a trimmed cover image caption", async () => {
    mockSelect([{ id: "asset-1", slug: "lisbon-airport-parking", status: "published" }]);
    const setSpy = vi.fn((_values: Record<string, unknown>) => ({
      where: () => Promise.resolve()
    }));
    updateMock.mockImplementationOnce(() => ({ set: setSpy }));
    insertMock.mockImplementationOnce(() => ({ values: vi.fn() }));

    const result = await updateAssetImages({
      assetId: "asset-1",
      coverImageUrl: "https://images.example.com/lisbon.jpg",
      galleryImageUrlsText: "",
      coverImageCaption: "  Terminal forecourt, illustrative.  "
    });

    expect(result).toEqual({ ok: true });
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        coverImageCaption: "Terminal forecourt, illustrative."
      })
    );
  });

  it("stores blank caption as null", async () => {
    mockSelect([{ id: "asset-1", slug: "lisbon-airport-parking", status: "published" }]);
    const setSpy = vi.fn((_values: Record<string, unknown>) => ({
      where: () => Promise.resolve()
    }));
    updateMock.mockImplementationOnce(() => ({ set: setSpy }));
    insertMock.mockImplementationOnce(() => ({ values: vi.fn() }));

    const result = await updateAssetImages({
      assetId: "asset-1",
      coverImageUrl: "",
      galleryImageUrlsText: "",
      coverImageCaption: "   "
    });

    expect(result).toEqual({ ok: true });
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({ coverImageCaption: null }));
  });
});
