import { describe, expect, it } from "vitest";
import { parseUserAgent } from "@/lib/access/ua";

describe("parseUserAgent", () => {
  it("returns nulls for empty", () => {
    expect(parseUserAgent("")).toEqual({
      browser: null,
      os: null,
      device: null
    });
  });

  it("parses Chrome on macOS", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    const parsed = parseUserAgent(ua);
    expect(parsed.browser).toMatch(/Chrome/i);
    expect(parsed.os).toMatch(/Mac/i);
    expect(parsed.device).toBe("desktop");
  });

  it("marks iPhone as mobile", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(parseUserAgent(ua).device).toBe("mobile");
  });
});
