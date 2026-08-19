import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { account } from "@/lib/db/auth-schema";

describe("auth-schema account passwordSetAt (lib/db/auth-schema)", () => {
  it("adds a nullable password_set_at timestamp marking completed invite activation", () => {
    const column = getTableConfig(account).columns.find((entry) => entry.name === "password_set_at");
    expect(column).toBeDefined();
    expect(column?.columnType).toBe("PgTimestamp");
    // Nullable with no default: NULL means "never activated", so existing
    // credential accounts (temp password) still accept their first invite.
    expect(column?.notNull).toBe(false);
    expect(column?.hasDefault).toBe(false);
  });
});
