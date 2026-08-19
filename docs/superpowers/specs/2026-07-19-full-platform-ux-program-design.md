# Full-platform UX & product critique program — Design

**Date:** 2026-07-19  
**Status:** Approved (plan execution)  
**Depends on:** Brand tokens in `apps/web/app/globals.css`; admin redesign `2026-07-18-admin-console-redesign-design.md` (Phase 4)

## Goal

Fix broken journeys, copy hierarchy, and responsive behavior across marketing, auth/onboarding, portal, and admin for anonymous, investor, agent, and super-admin personas.

## Locked decisions

| Decision | Choice |
|---|---|
| Surfaces | Full platform (marketing, auth, portal, admin) |
| Depth | Full product critique (flows, copy, redesign where journeys break) |
| Sequence | Investor funnel first (Phases 1–3), then admin redesign (Phase 4), then QA (Phase 5) |
| Design system | Extend existing Parkwise tokens — no new design-system package |
| Admin | Execute `2026-07-18-admin-console-redesign-design.md` as Phase 4 |
| Marketing body | Port sections from repo-root static HTML into Next pages |

## Personas & journeys

1. **Anonymous** — educate → browse opportunities → clear CTAs to sign up / sign in  
2. **Investor** — auth → onboarding → interest → portal → holdings / documents  
3. **Agent** — admin shell, book-scoped queues  
4. **Super admin** — admin shell + platform (staff, assets)

Viewports every phase: **360 / 720 / 1024 / 1440**.

## Backlog (numbered)

### P0

1. Header CTA labels mismatch destinations (portal vs sign-up)  
2. Footer Become/login destinations crossed  
3. Mobile ≤720 buries all CTAs in hamburger  
4. Marketing pages hero-only stubs  

### P1

5. Opportunities “Filter” copy with no filters  
6. Onboarding single long form; post-auth bounce via portal  
7. Blind eligibility checkbox  
8. No portal subnav  
9. Missing CSS (`.funding-figures`, `.table-wrap`, `.data`, `.auth-page`, `.field-hint`)  
10. Catalogue 3-col crush on tablet  
11. No finish-onboarding persistence  
12. Public `/documents` empty  
13. Long interest CTA overflow  

### P2

14. Nav active states  
15. `scroll-padding-top` + `prefers-reduced-motion`  
16. Post-interest portal link  
17. Closed holdings badge semantics  
18. `<main>` landmarks  

## Phases & exit gates

| Phase | Focus | Exit |
|---|---|---|
| 0 | This critique pack | Spec committed |
| 1 | Header/footer/mobile chrome, active nav, a11y | CTA truth; mobile primary CTA visible |
| 2 | Education pages + catalogue/docs viewport | No hero-only nav destinations |
| 3 | Auth, stepped onboarding, portal shell/CSS | Investor happy path on phone |
| 4 | Admin console redesign (approved spec) | Spec success criteria 1–6 |
| 5 | Persona + viewport + a11y QA | Checklist recorded; UI polish static-site spec superseded |

## Non-goals

- New backend filter/search APIs (client-only catalogue filters only if asset fields already on page; else copy fix)  
- Investor-facing login history; dialer; admin i18n  
- Dark mode; legal substance rewrite  
- Permission / server-action rewrites  

## Nested specs

- Phase 4 details: `docs/superpowers/specs/2026-07-18-admin-console-redesign-design.md`  
- Supersedes for Next app: `docs/superpowers/specs/2026-07-18-ui-polish-design.md` (static-site tooling) — mark superseded in Phase 5
