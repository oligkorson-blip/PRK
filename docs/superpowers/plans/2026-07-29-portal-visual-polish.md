# Investor Portal Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Soften the investor portal so cream/paper/type/surfaces match the public brand while keeping the dark sidebar IA.

**Architecture:** Consolidate competing portal/dash CSS (canonical block ~3139 + late override ~6152) onto design tokens; extend existing `tests/portal-ux-polish.test.ts` contract checks; markup only if a page gaps the shared kit.

**Tech Stack:** Next.js 15 App Router, `apps/web/app/globals.css`, vitest file-contract tests.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-29-portal-visual-polish-design.md` (Approved, post-review).
- `.dash` background → `var(--cream)`; cards/panels stay `var(--paper)`.
- Public radii: prefer `var(--radius-m)` for cards/panels/empty/banner (not hardcoded `8px`).
- Sidebar: keep dark `--green-950`; inactive `var(--on-dark-faint)`; active keep green fill + clear contrast (may keep lime inset if already present — do not invent a new active pattern).
- Empty states: one primary CTA; optional secondary ghost allowed.
- Include `.status-timeline` in the surface pass.
- **Never** change `.admin-*` rules in the same edit pass as portal polish.
- Consolidate/replace late portal hex overrides (~6152–6256); do not add a third competing layer.
- Run JS from `apps/web` with `export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"`.
- Commit when executing this plan as authorized work.

## File map

| File | Responsibility |
|------|----------------|
| `app/globals.css` | Tokenize + consolidate `.dash*` / `.portal-*` / cards / timeline |
| `tests/portal-ux-polish.test.ts` | Contract tests for tokens + kit + no admin bleed |
| Portal pages / `portal-shell.tsx` | Only if structure gaps (prefer CSS-only) |

---

### Task 1: Extend portal contract tests (TDD)

**Files:**
- Modify: `apps/web/tests/portal-ux-polish.test.ts`

**Interfaces:**
- Consumes: `app/globals.css` text; portal page sources
- Produces: failing assertions until CSS is tokenized

- [ ] **Step 1: Write failing token/consolidation tests**

Append to `tests/portal-ux-polish.test.ts`:

```ts
describe("portal brand tokens (visual polish 2026-07-29)", () => {
  it("uses cream canvas and tokenized dash surfaces", () => {
    const css = readFileSync(globalsCss, "utf8");
    // Canonical intent: cream canvas (may appear as .dash { background: var(--cream) })
    expect(css).toMatch(/\.dash\s*\{[^}]*background:\s*var\(--cream\)/);
    // Late hex canvas must not remain as the winning override without cream
    expect(css).not.toMatch(/\.dash\s*\{\s*background:\s*#f4f6f3/);
  });

  it("does not force 8px radius on portal cards in late overrides", () => {
    const css = readFileSync(globalsCss, "utf8");
    // Guard: grouped late override that set border-radius: 8px on portal surfaces
    expect(css).not.toMatch(
      /\.dash-panel,\s*\n\.interest-card,\s*\n\.empty-state,\s*\n\.portal-banner\s*\{\s*\n\s*border-radius:\s*8px/
    );
  });

  it("keeps status-timeline styles defined for overview", () => {
    const css = readFileSync(globalsCss, "utf8");
    expect(css).toContain(".status-timeline");
    expect(css).toContain(".status-timeline-pill");
  });

  it("does not introduce admin selectors into portal page markup", () => {
    const pages = [
      "page.tsx",
      "settings/page.tsx",
      "kyc/page.tsx",
      "interests/page.tsx",
      "holdings/page.tsx",
      "holdings/[id]/page.tsx",
      "documents/page.tsx"
    ];
    for (const rel of pages) {
      expect(read(rel), rel).not.toMatch(/admin-shell|admin-nav|admin-table/);
    }
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"
cd apps/web
npx vitest run tests/portal-ux-polish.test.ts
```

Expected: FAIL on cream canvas / `#f4f6f3` and/or `border-radius: 8px` grouped override.

- [ ] **Step 3: Commit tests**

```bash
git add apps/web/tests/portal-ux-polish.test.ts
git commit -m "test(web): contract portal cream tokens and card radii"
```

---

### Task 2: Tokenize shell + consolidate late dash overrides

**Files:**
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Produces: single coherent `.dash` shell styling under tokens
- Must not edit `.admin-*` blocks in the late CSS region

- [ ] **Step 1: Fix canonical `--dash-bg` (optional hygiene)**

Near `:root`, change:

```css
--dash-bg: #f7f7f3;
```

to:

```css
--dash-bg: var(--cream);
```

(or delete `--dash-bg` usages and set `.dash` to `--cream` directly — pick one and be consistent).

- [ ] **Step 2: Replace late `.dash` block (~6152–6208) with tokenized rules**

Replace the late hardcoded shell section (from `.dash { background: #f4f6f3; }` through `.dash-content { max-width: … }` **before** `.portal-page-head` late rules) with something equivalent to:

```css
.dash {
  background: var(--cream);
}
@media (min-width: 961px) {
  .dash-layout {
    grid-template-columns: 244px 1fr;
  }
}
.dash-side {
  padding: 24px 16px;
}
.dash-side .brand {
  margin-bottom: 26px;
}
.dash-nav a {
  gap: 11px;
  min-height: 44px;
  padding: 10px 12px;
  border-radius: var(--radius-mark);
  color: var(--on-dark-faint);
  font-size: 14px;
}
.dash-nav a svg {
  flex: none;
  color: var(--on-dark-faint);
}
.dash-nav a:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--on-dark);
}
.dash-nav a.active {
  background: var(--green-800);
  color: var(--on-dark);
  box-shadow: inset 3px 0 0 var(--lime);
}
.dash-nav a.active svg {
  color: var(--lime);
}
.dash-main {
  padding: 26px clamp(22px, 4vw, 52px) 64px;
}
.dash-topbar {
  min-height: 48px;
  margin-bottom: 30px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--line);
}
.dash-welcome {
  margin-top: 2px;
  color: var(--ink);
  font-size: 17px;
  font-weight: 750;
}
.dash-menu-btn {
  width: 42px;
  height: 42px;
  padding: 0;
  align-items: center;
  justify-content: center;
}
.dash-content {
  max-width: 1160px;
}
```

Also update the **early** `.dash` / `.dash-nav a` colors if they still hardcode `#a7bab0` — point inactive to `var(--on-dark-faint)` so cascade is consistent.

- [ ] **Step 3: Run contract tests**

```bash
npx vitest run tests/portal-ux-polish.test.ts
```

Expected: cream/canvas assertions PASS; radius assertion may still FAIL until Task 3.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "style(web): tokenize portal dash shell onto cream brand"
```

---

### Task 3: Surfaces — page head, KPI, cards, empty, timeline

**Files:**
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Tokenize late `.portal-page-head` / `.dash-kpi` / card group / ensure timeline uses tokens

- [ ] **Step 1: Replace late portal surface overrides (~6210–6256)**

Replace hardcoded lead color `#4f5f57`, KPI border `#dce2dd`, and especially:

```css
.dash-panel,
.interest-card,
.empty-state,
.portal-banner {
  border-radius: 8px;
  box-shadow: none;
}
```

with tokenized equivalents, e.g.:

```css
.portal-page-head {
  gap: var(--space-2);
  padding-bottom: var(--space-7);
}
.portal-page-head .display-m {
  font-size: clamp(28px, 3vw, 36px);
  line-height: 1.16;
}
.portal-page-head .lead {
  max-width: 48rem;
  color: var(--muted);
  font-size: 16px;
}
.portal-eyebrow {
  color: var(--green-700);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.dash-kpi-grid {
  gap: var(--space-3);
}
.dash-kpi {
  min-height: 136px;
  padding: 18px;
  border-color: var(--line-soft);
  border-radius: var(--radius-m);
  box-shadow: none;
  background: var(--paper);
}
.dash-kpi span {
  margin-bottom: 8px;
  color: var(--muted);
  font-size: 12px;
}
.dash-kpi b {
  font-size: 25px;
}
.dash-panel,
.interest-card,
.empty-state,
.portal-banner {
  border-radius: var(--radius-m);
  box-shadow: none;
}
.interest-card {
  border-color: var(--line-soft);
  background: var(--paper);
}
```

Remove `!important` on page-head padding if a single consolidated rule can win without it.

- [ ] **Step 2: Timeline surface pass**

In the existing `.status-timeline*` block (~3288), ensure:

- connectors/borders use `var(--line)` / `var(--line-soft)`
- body text uses `var(--muted)`
- no new hardcoded greys
- optional: wrap timeline in paper is **not** required; keep list layout, just token hygiene

If timeline already uses tokens, leave structure; only fix hex if any crept in.

- [ ] **Step 3: Empty-state CTA note (markup only if needed)**

Documents page may keep primary + secondary ghost (allowed). Ensure `.empty-state` uses cream/paper + `--radius-m` and dashed `var(--line)` — already largely true at ~5004; late override must not flatten radius to 8px.

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/portal-ux-polish.test.ts
npx tsc --noEmit
```

Expected: all portal-ux-polish tests PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "style(web): tokenize portal cards, heads, and timeline surfaces"
```

---

### Task 4: Visual verify + regression guard

**Files:** none required if CSS-only; optional tiny markup if a page lacks `portal-page-head` (tests already require it).

- [ ] **Step 1: Manual checklist**

With local stack (`npm run docker:local:host` or existing Next + Postgres):

- Desktop + ~390px: `/portal`, `/portal/interests`, `/portal/holdings`, `/portal/documents`, `/portal/kyc`, `/portal/settings`
- Spot-check `/admin` (or any admin page): sidebar/nav unchanged
- Confirm cream canvas + paper cards; no grey console feel; timeline matches overview

- [ ] **Step 2: Full unit suite**

```bash
npx vitest run
```

Expected: PASS.

- [ ] **Step 3: Final commit if any markup/CSS nits**

```bash
git add apps/web/app/globals.css apps/web/app/portal apps/web/components/portal-shell.tsx
git commit -m "style(web): finish portal visual polish pass"
```

(Skip empty commit if nothing left.)

- [ ] **Step 4: Push when asked**

```bash
git push -u origin HEAD
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| `.dash` → `--cream`; paper cards | 2–3 |
| Tokenize late hex / kill 8px card radius | 1–3 |
| Sidebar inactive faint; active green clear | 2 |
| Page head / KPI / lists / empty / timeline | 3 |
| Empty CTA primary + optional secondary | 3 (CSS; docs markup already OK) |
| Admin untouched | 1 guard + 2–3 edit discipline |
| Six-route visual verify | 4 |

## Placeholder scan

No TBD steps; concrete selectors and test snippets included.

## Type consistency

- Classes: `.dash`, `.dash-nav`, `.portal-page-head`, `.portal-eyebrow`, `.dash-kpi`, `.dash-panel`, `.interest-card`, `.empty-state`, `.portal-banner`, `.status-timeline`
- Tokens: `--cream`, `--paper`, `--muted`, `--line`, `--line-soft`, `--radius-m`, `--radius-mark`, `--on-dark-faint`, `--green-800`, `--lime`
