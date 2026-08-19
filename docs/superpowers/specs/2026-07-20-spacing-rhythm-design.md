# Parkwise spacing & vertical rhythm — design

**Date:** 2026-07-20  
**Scope:** Marketing + apply/auth + portal + admin (Approach 1: token + utility pass)  
**Status:** Approved via expert self-review (claims verified against `apps/web`)

## Goal

Unify paddings, section rhythm, and repeated margin one-offs so important surfaces share one 4px-token system — without redesigning brand, copy, or IA.

## Verified facts

- Tokens `--space-1…12`, `--gutter`, `--section` exist (`app/globals.css`).
- `--section` is already responsive (88 → 80 @1024 → 72 @720). **Do not change its meaning globally.**
- `.section-tight` uses raw `64px` (equals `--space-10` but not wired).
- `.portal-page` is dead CSS; live portal uses `dash-*` + `.dash-content .section-tight`.
- Onboarding is the only `section section-tight` stack (cascade trap).
- FAQ/fees use inline `maxWidth: 860`.
- CTA lead `18px 0 30px` on home / about / why-parking (off-scale).
- `.detail-block` uses both `padding-bottom: 40px` and `margin-bottom: 28px`.
- Admin inset lives on `.admin-main`; `.admin-page { padding-block: 0 }` inside shell must stay.
- ~50 `style={{ margin* }}` occurrences in `app/**/*.tsx`.

## Architecture

### Shells (do not conflate)

| Surface | Owns vertical inset | Notes |
|---------|---------------------|--------|
| Marketing | `.hero` / `.page-hero` + `.section` + `.container` | May use `--section`; do not shrink `--section` for portal |
| Auth | `.sign-in-page` / `.auth-page` / `.portal-card` | Separate from marketing section rhythm |
| Portal | `.dash-main` + `.dash-content` | Shell-owned; pages use `.section-tight` under dash override |
| Admin | `.admin-main` | Keep `.admin-page` at 0 padding inside shell |

### Tokens / CSS changes

1. Add `--section-tight: var(--space-10)` (responsive: slightly smaller on phone if needed).
2. `.section-tight { padding-block: var(--section-tight); }` — never stack with `.section`.
3. Add utilities:
   - `.cta-lead` → `margin: var(--space-5) 0 var(--space-7)` (replaces 18/30)
   - `.section-foot` → top gap for post-section CTAs (`var(--space-8)` or `--space-7`)
   - `.stack-3` / `.stack-4` / `.stack-6` → common vertical gaps on the scale
   - `.container-narrow` → `max-width: 860px` (FAQ/fees; keep legal on `.legal-content`)
4. `.detail-block`: keep border + **one** separator spacing (prefer `padding-bottom: var(--space-8)`; drop extra `margin-bottom` or invert — pick one).
5. Delete dead `.portal-page` rules (and nested `.portal-page .section-tight`).
6. Align raw hero/page-hero paddings toward tokens where equal (`80px` → nearest token or leave if intentionally between scale); do not force every magic number in one PR if visual delta is large — prioritize consistency of **section** and **inline margin removal**.

### Markup changes (priority order)

1. **Marketing:** home, how-it-works, about, why-parking, FAQ, fees, contact, documents — replace CTA lead + foot margins; FAQ/fees → `.container-narrow`.
2. **Opportunities:** catalogue (light); detail client — reduce inline margins; fix `.detail-block`.
3. **Auth flows:** onboarding → single class (`section-tight` only under page-hero); apply hints use stack utilities; sign-in leave shell, only strip off-scale inline if present.
4. **Portal:** strip scattered `marginTop` on KPI/links; keep dash shell paddings; do not apply marketing `.section`.
5. **Admin:** replace one-off section `marginTop: 40` with utility; do not restore `.admin-page` padding.

## Out of scope

- Brand palette, fonts, copy, card-ifying heroes
- Tailwind / new spacing package rewrite
- Changing `--section` base value
- Renaming `dash-*` → `portal-*`

## Done when

- Shared utilities exist and are used on priority marketing + detail pages
- Onboarding not stacking `section` + `section-tight`
- Dead `.portal-page` removed
- Detail block no longer double-spaced
- Portal/admin shell insets unchanged in role; only content gaps cleaned
- Smoke: home, `/opportunities/[slug]`, `/apply`, `/portal`, `/admin` at ~360 / 768 / 1280

## Super prompt (execution)

```text
Act as a senior frontend design-systems team on Parkwise apps/web.
Unify spacing via existing --space-* tokens and new utilities.
Do not redesign brand or change --section meaning.
Marketing first, then auth, portal (dash-*), admin last.
Prefer CSS classes over inline margin styles.
Shell-owned padding stays on dash-main / admin-main.
```
