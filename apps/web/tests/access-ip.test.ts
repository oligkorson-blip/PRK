import { describe, expect, it } from "vitest";
import { isPrivateIp } from "@/lib/access/ip";

describe("isPrivateIp", () => {
  it("detects loopback and RFC1918", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("10.0.0.5")).toBe(true);
    expect(isPrivateIp("192.168.1.1")).toBe(true);
    expect(isPrivateIp("172.16.0.1")).toBe(true);
    expect(isPrivateIp("172.31.255.1")).toBe(true);
    expect(isPrivateIp("203.0.113.10")).toBe(false);
    expect(isPrivateIp("172.32.0.1")).toBe(false);
  });

  it("detects link-local and this-network ranges", () => {
    expect(isPrivateIp("169.254.1.1")).toBe(true);
    expect(isPrivateIp("0.0.0.0")).toBe(true);
    expect(isPrivateIp("0.1.2.3")).toBe(true);
  });

  it("detects the CGNAT range 100.64.0.0/10", () => {
    expect(isPrivateIp("100.64.0.1")).toBe(true);
    expect(isPrivateIp("100.127.255.254")).toBe(true);
    expect(isPrivateIp("100.63.255.255")).toBe(false);
    expect(isPrivateIp("100.128.0.1")).toBe(false);
  });

  it("detects benchmarking and reserved ranges", () => {
    expect(isPrivateIp("198.18.0.1")).toBe(true);
    expect(isPrivateIp("198.19.255.1")).toBe(true);
    expect(isPrivateIp("198.20.0.1")).toBe(false);
    expect(isPrivateIp("240.0.0.1")).toBe(true);
    expect(isPrivateIp("255.255.255.255")).toBe(true);
    expect(isPrivateIp("239.255.255.255")).toBe(false);
  });

  it("classifies IPv4-mapped IPv6 by the embedded address", () => {
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIp("::FFFF:10.0.0.5")).toBe(true);
    expect(isPrivateIp("::ffff:169.254.1.1")).toBe(true);
    expect(isPrivateIp("::ffff:203.0.113.10")).toBe(false);
  });

  it("classifies hex-form IPv4-mapped IPv6 by the embedded address", () => {
    expect(isPrivateIp("::ffff:7f00:1")).toBe(true);
    expect(isPrivateIp("0:0:0:0:0:ffff:7f00:1")).toBe(true);
    expect(isPrivateIp("::ffff:a00:5")).toBe(true); // 10.0.0.5
    expect(isPrivateIp("::ffff:cb00:710a")).toBe(false); // 203.0.113.10
  });

  it("detects IPv6 loopback and private prefixes case-insensitively", () => {
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("fc00::1")).toBe(true);
    expect(isPrivateIp("FC00::1")).toBe(true);
    expect(isPrivateIp("fd12:3456::1")).toBe(true);
    expect(isPrivateIp("FD12:3456::1")).toBe(true);
    expect(isPrivateIp("fe80::1")).toBe(true);
    expect(isPrivateIp("FE80::1")).toBe(true);
    expect(isPrivateIp("2001:4860:4860::8888")).toBe(false);
  });

  it("detects non-canonical and expanded IPv6 forms", () => {
    expect(isPrivateIp("0:0:0:0:0:0:0:1")).toBe(true);
    expect(isPrivateIp("0000:0000:0000:0000:0000:0000:0000:0001")).toBe(true);
    expect(isPrivateIp("::")).toBe(true);
    expect(isPrivateIp("0:0:0:0:0:0:0:0")).toBe(true);
    expect(isPrivateIp("2001:0:4860:4860:0:0:0:8888")).toBe(false);
  });

  it("covers the full fe80::/10 link-local range", () => {
    expect(isPrivateIp("fe80::1")).toBe(true);
    expect(isPrivateIp("fe90::1")).toBe(true);
    expect(isPrivateIp("fea0::1")).toBe(true);
    expect(isPrivateIp("febf:ffff::1")).toBe(true);
    expect(isPrivateIp("fec0::1")).toBe(false);
  });

  it("leaves public IPv4 addresses public", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("203.0.113.10")).toBe(false);
  });

  it("fails closed on non-canonical IPv4 forms — never enrichable", () => {
    // Non-canonical spellings of private addresses that dotted-quad prefix
    // matching would otherwise miss and leak to the enrichment API.
    expect(isPrivateIp("127.1")).toBe(true); // short form of 127.0.0.1
    expect(isPrivateIp("0x7f000001")).toBe(true); // hex form of 127.0.0.1
    expect(isPrivateIp("2130706433")).toBe(true); // decimal form of 127.0.0.1
    expect(isPrivateIp("10.1")).toBe(true); // short form of 10.0.0.1
    // Out-of-range, octal-style, truncated, or padded input fails closed too.
    expect(isPrivateIp("300.0.0.1")).toBe(true);
    expect(isPrivateIp("010.0.0.1")).toBe(true);
    expect(isPrivateIp("8.8.8.08")).toBe(true);
    expect(isPrivateIp("8.8.8")).toBe(true);
    expect(isPrivateIp("8.8.8.8.")).toBe(true);
  });

  it("fails closed on unparseable or non-IP input", () => {
    expect(isPrivateIp("")).toBe(true);
    expect(isPrivateIp("not-an-ip")).toBe(true);
    expect(isPrivateIp("8.8.8.8 ")).toBe(true);
    expect(isPrivateIp(" 8.8.8.8")).toBe(true);
    expect(isPrivateIp("1:2:3")).toBe(true); // IPv6-looking but invalid
    expect(isPrivateIp(":::1")).toBe(true);
    expect(isPrivateIp("::ffff:999.1.1.1")).toBe(true);
  });
});
