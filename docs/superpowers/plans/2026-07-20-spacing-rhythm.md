# Spacing Rhythm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify paddings and vertical rhythm across marketing, auth, portal, and admin via tokens and shared utilities — without changing `--section` meaning or shell ownership.

**Architecture:** Add `--section-tight` + utilities in `globals.css`; remove dead `.portal-page`; fix `.detail-block`; replace priority inline margins in page TSX. Portal stays on `dash-*`; admin inset stays on `.admin-main`.

**Tech Stack:** Next.js App Router, `apps/web/app/globals.css`, React page components.

**Status:** Implemented on `main` (`e129fae`); residual catalogue inline spacers cleaned 2026-07-20; detail/admin/guides residual `marginTop` → stack utilities continued 2026-07-20 (uncommitted follow-up).

## Global Constraints

- Do not change `--section` base semantics (keep responsive 88/80/72).
- Do not rename `dash-*` or restore marketing padding on `.admin-page` inside shell.
- Prefer `--space-*` scale; map CTA lead to `space-5` / `space-7`.
- Preserve brand/copy/IA; spacing only.
- Docker may be running on :3000 — visual smoke after CSS changes.

---

## File map

| File | Responsibility |
|------|----------------|
| `apps/web/app/globals.css` | Tokens, utilities, detail-block, delete portal-page, tokenize section-tight |
| Marketing `app/*/page.tsx` | Replace inline margins; FAQ/fees container-narrow |
| `components/opportunity-detail-client.tsx` | Strip off-scale inline spacers where utilities cover |
| `app/onboarding/page.tsx` | Single section class |
| Portal `app/portal/**/*.tsx` | Content gap utilities only |
| Admin pages with `marginTop: 40` | Utility instead of inline |

---

### Task 1: CSS tokens & utilities

- [x] Add `--section-tight: var(--space-10)` (+ phone tweak if needed)
- [x] Wire `.section-tight` to token
- [x] Add `.cta-lead`, `.section-foot`, `.stack-3/4/6`, `.container-narrow`
- [x] Fix `.detail-block` (one separator spacing)
- [x] Delete `.portal-page` rules
- [x] Commit

### Task 2: Marketing pages

- [x] Home, about, why-parking → `.cta-lead`
- [x] how-it-works, FAQ, fees, contact, documents → foot/stack utilities
- [x] FAQ + fees → `.container.container-narrow`
- [x] Commit

### Task 3: Opportunities + detail

- [x] Detail client: reduce redundant inline margins using stack utilities / CSS
- [x] Smoke detail block spacing
- [x] Commit

### Task 4: Auth flows

- [x] Onboarding: drop stacked `section section-tight` → one class
- [x] Apply: hint/stack utilities
- [x] Commit

### Task 5: Portal + admin

- [x] Portal pages: replace scattered marginTop with stack utilities
- [x] Admin: replace section marginTop one-offs
- [x] Commit

### Task 6: Verify

- [x] Unit / typecheck smoke on touched files
- [x] Spot-check via `npm run dev` + Playwright (postgres compose): home, catalogue, apply, portal/admin redirects; full Docker web image rebuild blocked (registry timeout)
- [ ] Optional: visual check @ 360/1280 viewport widths in browser
- [x] Residual detail/admin/guides `marginTop` → stack utilities (incl. `.stack-2` / `.stack-5`)