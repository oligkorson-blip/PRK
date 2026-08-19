import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapApiPayload, enrichIp } from "@/lib/access/enrich";

const ENV_KEYS = [
  "IP_ENRICHMENT_API_URL",
  "IP_ENRICHMENT_API_KEY",
  "IP_ENRICHMENT_MMDB_PATH",
] as const;

const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("mapApiPayload", () => {
  it("maps ipinfo-style privacy flags", () => {
    const fields = mapApiPayload({
      ip: "203.0.113.10",
      city: "Paris",
      region: "Île-de-France",
      country: "FR",
      country_name: "France",
      timezone: "Europe/Paris",
      org: "AS3215 Orange",
      privacy: { vpn: true, proxy: false, hosting: false },
    });
    expect(fields.countryCode).toBe("FR");
    expect(fields.city).toBe("Paris");
    expect(fields.isVpn).toBe(true);
    expect(fields.isProxy).toBe(false);
  });
});

describe("enrichIp", () => {
  it("marks private IPs partial without calling API", async () => {
    const fetchImpl = vi.fn();
    const result = await enrichIp("127.0.0.1", { fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.status).toBe("partial");
    expect(result.source).toBe("none");
  });

  it("keeps VPN-only API results as partial", async () => {
    process.env.IP_ENRICHMENT_API_URL = "https://example.test/json/{ip}";
    process.env.IP_ENRICHMENT_API_KEY = "test-key";

    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ip: "203.0.113.10",
          privacy: { vpn: true, proxy: false, hosting: false },
        }),
        { status: 200 }
      )
    );
    const result = await enrichIp("203.0.113.10", { fetchImpl, timeoutMs: 500 });
    expect(result.source).toBe("api");
    expect(result.isVpn).toBe(true);
    expect(result.status).toBe("partial");
  });

  it("uses API result when fetch succeeds", async () => {
    process.env.IP_ENRICHMENT_API_URL = "https://example.test/json/{ip}";
    process.env.IP_ENRICHMENT_API_KEY = "test-key";

    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          city: "Berlin",
          country: "DE",
          country_name: "Germany",
          org: "Example ISP",
        }),
        { status: 200 }
      )
    );
    const result = await enrichIp("203.0.113.10", { fetchImpl, timeoutMs: 500 });
    expect(result.source).toBe("api");
    expect(result.city).toBe("Berlin");
    expect(result.status).toBe("ok");
  });
});
