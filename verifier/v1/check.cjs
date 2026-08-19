/* Parkwise design verifier v1 — layout integrity, console health,
   touch targets, contrast, imagery health across viewports.

   Expects the app at ../../apps/web (deps installed — playwright-core ships
   with @playwright/test) and the app running on BASE. Auth pages are audited
   in a separate browser context per persona; a sign-in that does not reach
   the persona's landing page fails the run loudly. Credentials default to the
   values below and can be overridden via VERIFIER_INVESTOR_EMAIL /
   VERIFIER_INVESTOR_PASSWORD / VERIFIER_OPS_EMAIL / VERIFIER_OPS_PASSWORD. */
const fs = require('fs');
const nodePath = require('path');

const APP_DIR = nodePath.resolve(__dirname, '..', '..', 'apps', 'web');
const PLAYWRIGHT_PATH = nodePath.join(APP_DIR, 'node_modules', 'playwright-core');
let chromium;
try {
  ({ chromium } = require(PLAYWRIGHT_PATH));
} catch (e) {
  console.error(`FATAL: cannot load playwright-core from ${PLAYWRIGHT_PATH}`);
  console.error('Run `npm install` in apps/web first (playwright-core ships with @playwright/test).');
  console.error(String(e && e.message ? e.message : e));
  process.exit(1);
}

const BASE = 'http://localhost:3000';
const OUT = '/tmp/shots/design';

const PAGES = [
  ['home', '/'],
  ['how-it-works', '/how-it-works'],
  ['why-parking', '/why-parking'],
  ['fees', '/fees'],
  ['faq', '/faq'],
  ['guides', '/guides'],
  ['apply', '/apply'],
  ['contact', '/contact'],
  ['about', '/about'],
];

const PERSONAS = {
  investor: {
    email: process.env.VERIFIER_INVESTOR_EMAIL || 'investor@example.com',
    password: process.env.VERIFIER_INVESTOR_PASSWORD || '',
    landing: '/portal',
  },
  ops: {
    email: process.env.VERIFIER_OPS_EMAIL || 'ops@parkwise.eu',
    password: process.env.VERIFIER_OPS_PASSWORD || '',
    landing: '/admin',
  },
};

// No default passwords — credentials must come from the environment.
for (const [name, p] of Object.entries(PERSONAS)) {
  if (!p.password) {
    throw new Error(`VERIFIER_${name.toUpperCase()}_PASSWORD is not set; refusing to run with a default password`);
  }
}

const AUTH_PAGES = [
  ['opportunities', '/opportunities', 'investor'],
  ['opp-detail', '/opportunities/qpark-berlin-potsdamer', 'investor'],
  ['portal', '/portal', 'investor'],
  ['portal-holdings', '/portal/holdings', 'investor'],
  ['admin', '/admin', 'ops'],
  ['admin-leads', '/admin/leads', 'ops'],
];

const VIEWPORTS = [
  ['320', { width: 320, height: 700 }],
  ['360', { width: 360, height: 740 }],
  ['390', { width: 390, height: 844 }],
  ['768', { width: 768, height: 1024 }],
  ['1024', { width: 1024, height: 800 }],
  ['1440', { width: 1440, height: 900 }],
  ['1920', { width: 1920, height: 1080 }],
];

/* Sign `persona` into `ctx` via the auth API, then prove the session works by
   loading the persona's landing page. Throws — failing the run — on any step. */
async function signIn(ctx, persona) {
  let res;
  try {
    res = await ctx.request.post(BASE + '/api/auth/sign-in/email', {
      data: { email: persona.email, password: persona.password },
    });
  } catch (e) {
    throw new Error(`sign-in request failed for ${persona.email}: ${String(e).slice(0, 160)}`);
  }
  if (!res.ok()) {
    throw new Error(`sign-in rejected for ${persona.email}: HTTP ${res.status()} — set VERIFIER_* env credentials to a seeded account`);
  }
  const probe = await ctx.newPage();
  let landed;
  try {
    await probe.goto(BASE + persona.landing, { waitUntil: 'domcontentloaded', timeout: 45000 });
    landed = probe.url();
  } catch (e) {
    throw new Error(`landing ${persona.landing} unreachable after sign-in for ${persona.email}: ${String(e).slice(0, 160)}`);
  } finally {
    await probe.close();
  }
  /* Non-staff ops accounts are redirected to `/` (app/admin/layout.tsx), which
     never contains '/sign-in' — so require the landed path to actually start
     with the persona's landing path, not merely to have escaped /sign-in. */
  const landedPath = landed ? new URL(landed).pathname : '';
  if (!landedPath.startsWith(persona.landing)) {
    throw new Error(`sign-in for ${persona.email} did not reach ${persona.landing} (landed on ${landed || 'nothing'})`);
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const report = [];

  for (const [vpName, vp] of VIEWPORTS) {
    const auditAuth = vpName === '390' || vpName === '1440';
    /* Public pages are audited anonymously; auth pages run in a dedicated
       context per persona so each role is audited as itself. */
    const jobs = [{ persona: null, pages: PAGES }];
    if (auditAuth) {
      for (const persona of Object.keys(PERSONAS)) {
        jobs.push({ persona, pages: AUTH_PAGES.filter(([, , p]) => p === persona).map(([n, p]) => [n, p]) });
      }
    }
    for (const job of jobs) {
      const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
      if (job.persona) {
        try {
          await signIn(ctx, PERSONAS[job.persona]);
        } catch (e) {
          report.push({ vp: vpName, page: 'sign-in:' + job.persona, fatal: String(e && e.message ? e.message : e).slice(0, 200) });
          await ctx.close();
          continue;
        }
      }
      const page = await ctx.newPage();
      for (const [name, pagePath] of job.pages) {
        const errors = [];
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
        page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 200)));
        try {
          const res = await page.goto(BASE + pagePath, { waitUntil: 'networkidle', timeout: 45000 });
          await page.waitForTimeout(600);
          await page.evaluate(async () => {
            const step = window.innerHeight * 0.8;
            for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
              window.scrollTo(0, y);
              await new Promise((r) => setTimeout(r, 250));
            }
            window.scrollTo(0, document.documentElement.scrollHeight);
            await new Promise((r) => setTimeout(r, 1500));
            window.scrollTo(0, 0);
            await Promise.race([
              Promise.all(
                Array.from(document.images).map((img) =>
                  img.complete
                    ? Promise.resolve()
                    : new Promise((res) => {
                        img.addEventListener('load', res, { once: true });
                        img.addEventListener('error', res, { once: true });
                        setTimeout(res, 2500);
                      })
                )
              ),
              new Promise((r) => setTimeout(r, 4000))
            ]);
          });
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          const touch = await page.evaluate(() => {
            const bad = [];
            document.querySelectorAll('a, button, select, input, textarea, summary').forEach((el) => {
              const r = el.getBoundingClientRect();
              if (r.width > 0 && r.height > 0 && r.height < 40 && r.top >= 0 && r.bottom <= window.innerHeight + 2000) {
                const cs = getComputedStyle(el);
                if (cs.display === 'none' || cs.visibility === 'hidden') return;
                if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) {
                  const host = el.closest('label, .check-row, .sim-check, .form-checkbox');
                  if (host && host.getBoundingClientRect().height >= 40) return;
                }
                bad.push(el.tagName + '.' + String(el.className).split(' ')[0] + ':' + Math.round(r.height));
              }
            });
            return bad.slice(0, 6);
          });
          const contrast = await page.evaluate(() => {
            const targets = document.querySelectorAll('p.lead, .field-hint, .muted-stat, .admin-table td, .asset-card-loc, .home-hero-support, .page-hero .lead');
            let checked = 0, failed = 0;
            const fails = [];
            targets.forEach((el) => {
              if (checked >= 12) return;
              const cs = getComputedStyle(el);
              const fg = cs.color.match(/\d+/g).map(Number);
              let bg = [255, 255, 255];
              let node = el;
              while (node) {
                const b = getComputedStyle(node).backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
                if (b && (b[4] === undefined || parseFloat(b[4]) > 0.9)) { bg = [+b[1], +b[2], +b[3]]; break; }
                node = node.parentElement;
              }
              const darkHost = el.closest('.home-hero, .page-hero, .cta-band, .home-cta, .bg-dark, .site-footer, .dash-side, .sim-result, .opp-detail-hero, .asset-card-art');
              if (darkHost) bg = [10, 71, 52];
              const lum = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
              const L1 = 0.2126 * lum(fg[0]) + 0.7152 * lum(fg[1]) + 0.0722 * lum(fg[2]);
              const L2 = 0.2126 * lum(bg[0]) + 0.7152 * lum(bg[1]) + 0.0722 * lum(bg[2]);
              const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
              const isLarge = parseFloat(cs.fontSize) >= 18.66 || (parseFloat(cs.fontSize) >= 14 && parseInt(cs.fontWeight) >= 700);
              checked++;
              if (ratio < (isLarge ? 3 : 4.5)) { failed++; fails.push(el.className + ':' + ratio.toFixed(2)); }
            });
            return { checked, failed, fails: fails.slice(0, 5) };
          });
          const imgs = await page.evaluate(() => {
            const broken = [];
            document.querySelectorAll('img').forEach((img) => {
              if (img.offsetParent === null && getComputedStyle(img).position !== 'fixed') return;
              if (!img.complete || img.naturalWidth === 0) broken.push(img.src.split('/').pop());
            });
            return broken;
          });
          if (auditAuth) {
            await page.screenshot({ path: `${OUT}/${vpName}-${name}.png`, fullPage: true });
          }
          const issues = {};
          if (overflow > 0) issues.overflowPx = overflow;
          if (errors.length) issues.errors = errors.slice(0, 3);
          if (touch.length) issues.smallTouchTargets = touch;
          if (contrast.failed) issues.contrastFails = contrast.fails;
          if (imgs.length) issues.brokenImages = imgs;
          if (res && res.status() !== 200) issues.status = res.status();
          if (Object.keys(issues).length) report.push({ vp: vpName, page: name, ...issues });
        } catch (e) {
          report.push({ vp: vpName, page: name, fatal: String(e).slice(0, 200) });
        }
        page.removeAllListeners('console');
        page.removeAllListeners('pageerror');
      }
      await ctx.close();
    }
  }
  await browser.close();
  console.log(JSON.stringify(report, null, 1));
  console.log('VERIFIER-DONE', report.length === 0 ? 'ALL-PASS' : `${report.length} issue(s)`);
})();
