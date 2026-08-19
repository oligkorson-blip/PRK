import { describe, expect, it } from "vitest";
import {
  IP_THROTTLE_MAX_BUCKETS,
  IP_THROTTLE_MAX_PER_WINDOW,
  clientIpFromForwardedFor,
  ipThrottleAllows
} from "@/lib/apply/ip-throttle";

describe("ipThrottleAllows", () => {
  it("passes when no IP is available", () => {
    expect(ipThrottleAllows("apply.submit", null)).toBe(true);
    expect(ipThrottleAllows("apply.submit", "")).toBe(true);
  });

  it("allows up to the window max, then blocks", () => {
    const ip = "203.0.113.10";
    const start = 1_000_000;
    for (let i = 0; i < IP_THROTTLE_MAX_PER_WINDOW; i++) {
      expect(ipThrottleAllows("apply.submit", ip, start)).toBe(true);
    }
    expect(ipThrottleAllows("apply.submit", ip, start)).toBe(false);
    expect(ipThrottleAllows("apply.submit", ip, start + 1000)).toBe(false);
  });

  it("tracks IPs independently", () => {
    const start = 2_000_000;
    for (let i = 0; i < IP_THROTTLE_MAX_PER_WINDOW; i++) {
      ipThrottleAllows("apply.submit", "203.0.113.20", start);
    }
    expect(ipThrottleAllows("apply.submit", "203.0.113.21", start)).toBe(true);
  });

  it("gives each action its own bucket — a throttled action does not block another on the same IP", () => {
    const ip = "203.0.113.25";
    const start = 2_500_000;
    for (let i = 0; i < IP_THROTTLE_MAX_PER_WINDOW; i++) {
      ipThrottleAllows("apply.sign-in-hint", ip, start);
    }
    // Sign-in hint failures are exhausted, but applications from the same
    // (e.g. shared NAT) IP still have their full window allowance.
    expect(ipThrottleAllows("apply.sign-in-hint", ip, start)).toBe(false);
    expect(ipThrottleAllows("apply.submit", ip, start)).toBe(true);
  });

  it("resets after the window elapses", () => {
    const ip = "203.0.113.30";
    const start = 3_000_000;
    for (let i = 0; i < IP_THROTTLE_MAX_PER_WINDOW; i++) {
      ipThrottleAllows("apply.submit", ip, start);
    }
    expect(ipThrottleAllows("apply.submit", ip, start + 61 * 60 * 1000)).toBe(true);
  });

  // These two tests share the module-level map: `capStart` is chosen past every
  // earlier test's window so those buckets expire and get swept at capacity.
  const capStart = 10_000_000;

  it("refuses new keys once the map is full, but keeps serving tracked IPs", () => {
    for (let i = 0; i < IP_THROTTLE_MAX_BUCKETS; i++) {
      ipThrottleAllows(
        "apply.submit",
        `10.${Math.floor(i / 65536)}.${Math.floor(i / 256) % 256}.${i % 256}`,
        capStart
      );
    }
    // Spoofed rotation of fresh IPs is cut off once capacity is reached.
    expect(ipThrottleAllows("apply.submit", "203.0.113.99", capStart)).toBe(false);
    // An already-tracked IP still has its own window allowance.
    expect(ipThrottleAllows("apply.submit", "10.0.0.0", capStart)).toBe(true);
  });

  it("sweeps expired buckets at capacity so new keys pass again", () => {
    const afterWindows = capStart + 61 * 60 * 1000;
    expect(ipThrottleAllows("apply.submit", "203.0.113.100", afterWindows)).toBe(true);
  });
});

describe("clientIpFromForwardedFor", () => {
  it("returns null when the header is absent or empty", () => {
    expect(clientIpFromForwardedFor(null)).toBe(null);
    expect(clientIpFromForwardedFor(undefined)).toBe(null);
    expect(clientIpFromForwardedFor("")).toBe(null);
  });

  it("trims a single entry", () => {
    expect(clientIpFromForwardedFor(" 203.0.113.40 ")).toBe("203.0.113.40");
  });

  it("trusts the right-most entry, not the client-supplied first one", () => {
    // The first entries can be forged by the caller; the last one was appended
    // by the trusted proxy closest to the server.
    expect(clientIpFromForwardedFor("198.51.100.1, 203.0.113.41")).toBe("203.0.113.41");
    expect(clientIpFromForwardedFor("10.0.0.1,198.51.100.2, 203.0.113.42")).toBe(
      "203.0.113.42"
    );
  });

  it("returns null when the right-most entry is blank", () => {
    expect(clientIpFromForwardedFor("203.0.113.43, ")).toBe(null);
  });
});
