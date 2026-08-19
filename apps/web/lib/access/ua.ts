export function parseUserAgent(ua: string | null | undefined): {
  browser: string | null;
  os: string | null;
  device: string | null;
} {
  if (!ua || !ua.trim()) {
    return { browser: null, os: null, device: null };
  }
  const s = ua;

  let browser: string | null = null;
  if (/Edg\//.test(s)) browser = "Edge";
  else if (/Chrome\//.test(s) && !/Chromium/.test(s)) browser = "Chrome";
  else if (/Firefox\//.test(s)) browser = "Firefox";
  else if (/Safari\//.test(s) && !/Chrome\//.test(s)) browser = "Safari";

  let os: string | null = null;
  if (/Windows/i.test(s)) os = "Windows";
  else if (/Android/i.test(s)) os = "Android";
  else if (/iPhone|iPad|iOS/i.test(s)) os = "iOS";
  else if (/Mac OS X|Macintosh/i.test(s)) os = "macOS";
  else if (/Linux/i.test(s)) os = "Linux";

  let device: string | null = "desktop";
  if (/Mobile|Android|iPhone/i.test(s)) device = "mobile";
  else if (/iPad|Tablet/i.test(s)) device = "tablet";

  return { browser, os, device };
}
