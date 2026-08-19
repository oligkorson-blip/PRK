import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { twoFactor, user } from "@/lib/db/auth-schema";

describe("auth-schema two-factor shape (lib/db/auth-schema)", () => {
  it("adds a non-null twoFactorEnabled flag with a false default to the user table", () => {
    const column = getTableConfig(user).columns.find((entry) => entry.name === "two_factor_enabled");
    expect(column).toBeDefined();
    expect(column?.columnType).toBe("PgBoolean");
    expect(column?.notNull).toBe(true);
    expect(column?.hasDefault).toBe(true);
    expect(column?.default).toBe(false);
  });

  it("defines the twoFactor table with the columns better-auth expects", () => {
    const config = getTableConfig(twoFactor);
    expect(config.name).toBe("twoFactor");
    expect(config.columns.map((column) => column.name).sort()).toEqual([
      "backupCodes",
      "failedVerificationCount",
      "id",
      "lockedUntil",
      "secret",
      "userId",
      "verified"
    ]);
  });

  it("keeps one two-factor record per user and cascades on user delete", () => {
    const config = getTableConfig(twoFactor);
    const uniqueIndex = config.indexes.find((entry) => entry.config.name === "twoFactor_userId_uidx");
    expect(uniqueIndex?.config.unique).toBe(true);
    expect(config.indexes.some((entry) => entry.config.name === "twoFactor_secret_idx")).toBe(true);

    const fk = config.foreignKeys.find((entry) => entry.reference().foreignTable === user);
    expect(fk?.onDelete).toBe("cascade");
  });
});
