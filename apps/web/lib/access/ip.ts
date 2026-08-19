// apps/web/lib/access/ip.ts

/**
 * Parse an IPv6 address into 8 hextets, expanding "::" compression and a
 * dotted IPv4 tail ("::ffff:127.0.0.1" → hextets 7f00:0001). Returns null for
 * non-IPv6 input.
 */
function parseIpv6Hextets(ip: string): number[] | null {
  let addr = ip.toLowerCase();

  const v4Tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(addr);
  if (v4Tail) {
    const octets = v4Tail[1].split(".").map(Number);
    if (octets.some((octet) => octet > 255)) return null;
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    addr = `${addr.slice(0, v4Tail.index)}${hi}:${lo}`;
  }

  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] === "" ? [] : halves[0].split(":");
  const right =
    halves.length === 2 && halves[1] !== "" ? halves[1].split(":") : [];
  const fill = 8 - left.length - right.length;
  if (fill < 0) return null;
  // Without "::" compression there must be exactly 8 groups.
  if (halves.length === 1 && fill !== 0) return null;

  const groups = [...left, ...Array<string>(fill).fill("0"), ...right];
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map((group) => parseInt(group, 16));
}

export function isPrivateIp(ip: string): boolean {
  const addr = ip.toLowerCase();

  if (addr.includes(":")) {
    const hextets = parseIpv6Hextets(addr);
    // Looks like IPv6 but does not parse — fail closed: never enrichable.
    if (!hextets) return true;
    // IPv4-mapped IPv6 ("::ffff:127.0.0.1", hex form "::ffff:7f00:1") is
    // classified by the embedded IPv4 address.
    if (hextets.slice(0, 5).every((h) => h === 0) && hextets[5] === 0xffff) {
      const v4 = [
        hextets[6] >> 8,
        hextets[6] & 0xff,
        hextets[7] >> 8,
        hextets[7] & 0xff
      ].join(".");
      return isPrivateIp(v4);
    }
    // Loopback "::1" in any expansion, and the unspecified address "::".
    if (hextets[7] <= 1 && hextets.slice(0, 7).every((h) => h === 0)) {
      return true;
    }
    // Unique-local fc00::/7.
    if ((hextets[0] & 0xfe00) === 0xfc00) return true;
    // Link-local fe80::/10 (fe80–febf, not just the fe80 prefix).
    if ((hextets[0] & 0xffc0) === 0xfe80) return true;
    return false;
  }

  // Only canonical dotted-quad IPv4 can be public. Non-canonical spellings of
  // private addresses (decimal 2130706433, hex 0x7f000001, short "127.1",
  // octal-style leading zeros, out-of-range octets) — and outright garbage —
  // fail closed: they are never sent to the enrichment API.
  const octets = addr.split(".");
  if (
    octets.length !== 4 ||
    octets.some(
      (octet) =>
        !/^\d{1,3}$/.test(octet) ||
        Number(octet) > 255 ||
        (octet.length > 1 && octet.startsWith("0"))
    )
  ) {
    return true;
  }

  if (addr.startsWith("0.") || addr.startsWith("127.")) return true;
  if (addr.startsWith("10.") || addr.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(addr)) return true;
  if (addr.startsWith("169.254.")) return true;
  // CGNAT 100.64.0.0/10 (100.64–100.127).
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(addr)) return true;
  // Benchmarking 198.18.0.0/15.
  if (/^198\.(18|19)\./.test(addr)) return true;
  // Reserved 240.0.0.0/4 (includes 255.255.255.255).
  if (/^(24\d|25[0-5])\./.test(addr)) return true;
  return false;
}
