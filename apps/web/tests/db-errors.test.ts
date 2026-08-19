import { describe, expect, it } from "vitest";
import { isUniqueViolation, postgresErrorCode } from "@/lib/db/errors";

describe("postgresErrorCode", () => {
  it("reads a bare driver error", () => {
    expect(postgresErrorCode({ code: "23505" })).toBe("23505");
  });

  it("unwraps a drizzle-wrapped error via .cause", () => {
    const wrapped = Object.assign(new Error("Failed query: insert ..."), {
      cause: Object.assign(new Error("duplicate key"), { code: "23505" })
    });
    expect(postgresErrorCode(wrapped)).toBe("23505");
  });

  it("walks nested causes", () => {
    const error = { cause: { cause: { code: "23514" } } };
    expect(postgresErrorCode(error)).toBe("23514");
  });

  it("returns undefined for non-error input and code-less chains", () => {
    expect(postgresErrorCode(null)).toBeUndefined();
    expect(postgresErrorCode("23505")).toBeUndefined();
    expect(postgresErrorCode(new Error("boom"))).toBeUndefined();
    expect(postgresErrorCode({ cause: null })).toBeUndefined();
  });

  it("isUniqueViolation matches bare and wrapped 23505 only", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ cause: { code: "23505" } })).toBe(true);
    expect(isUniqueViolation({ code: "23514" })).toBe(false);
    expect(isUniqueViolation({ cause: { code: "23514" } })).toBe(false);
  });
});
