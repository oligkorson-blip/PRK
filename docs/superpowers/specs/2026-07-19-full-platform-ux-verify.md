# Full-platform UX — verification checklist

**Date:** 2026-07-19  
**Program:** `docs/superpowers/specs/2026-07-19-full-platform-ux-program-design.md`

Automated: `cd apps/web && npm test -- --run` (must pass).

## Viewports

Check critical pages at **360 / 720 / 1024 / 1440**.

| Surface | Pages |
|---|---|
| Marketing | `/`, `/opportunities`, `/how-it-works`, `/why-parking`, `/about`, `/documents` |
| Auth | `/sign-up`, `/sign-in`, `/onboarding` |
| Portal | `/portal`, `/portal/holdings`, `/portal/documents` |
| Admin | `/admin`, `/admin/leads`, one detail, `/admin/interests` |

## Persona scripts

### Anonymous
- [ ] Header: **Create account** → `/sign-up`, **Sign in** → `/sign-in`
- [ ] Mobile ≤720: primary CTA visible outside hamburger
- [ ] Education pages have body content + CTA (not hero-only)
- [ ] Footer Become → `/sign-up`, login → `/sign-in`
- [ ] Opportunities filter by tier/city when assets exist

### Investor
- [ ] Sign-up lands on `/onboarding`
- [ ] Onboarding is 3 steps; eligibility links to `/legal/risk`
- [ ] Finish-setup banner when incomplete
- [ ] Portal subnav: Interests / Holdings / Documents
- [ ] Holdings figures styled; closed badge not “declined” red
- [ ] Interest success links to portal

### Agent / Super
- [ ] `/admin` uses hybrid shell (no marketing header/footer)
- [ ] Nav role-aware (Platform only for super)
- [ ] Hub shows role-aware cards
- [ ] Mobile drawer opens/closes; Escape closes
- [ ] Staff can open Admin from marketing header when signed in as staff

## A11y smoke
- [ ] Focus visible on nav/drawer controls
- [ ] `aria-current` on active portal/admin/marketing links
- [ ] `scroll-padding-top` keeps anchors below sticky header
- [ ] `prefers-reduced-motion` reduces admin fade / transitions

## Recorded result (implementer)

- Unit tests: pass (2026-07-19)
- Production build: pass after AssetCard client/DB decoupling (`d07530f`)
- CSS brace balance: fixed (unclosed `@media (hover: hover)` closed; auth/admin styles apply on touch)
- Admin table overflow: fixed (`overflow: hidden` removed; ≤900px scroll reasserted)
- Onboarding banner gate: aligned with `isOnboardingComplete`
- Admin hub: cheap counts from existing list/actions
- Admin drawer: focus trap + `aria-controls` / `inert` while open
- Docker image rebuilt and restarted on `http://localhost:3000` (2026-07-19)

### Automated smoke (anonymous, live container)

| Check | Result |
|---|---|
| `/api/health` | `{"ok":true}` |
| `/`, `/how-it-works`, `/why-parking`, `/about`, `/documents`, `/opportunities`, `/sign-up` | 200 |
| Header CTAs | **Create account** + **Sign in** present (not mislabeled portal) |
| Education bodies | how-it-works “Three clear steps”; why-parking “Four forces”; about “What we do”; documents vault copy |
| Opportunities filters | `filter-tier` / All tiers present |
| `/portal`, `/admin` unauthenticated | 307 → `/sign-in` |
| Built CSS | `.auth-page` + `.admin-shell` present; brace depth 0 at admin-shell; no `.admin-table{overflow:hidden}` |

### Still manual (signed-in personas / viewports)

- [ ] Investor: sign-up → onboarding steps → interest → portal subnav at 360/720
- [ ] Agent/super: `/admin` shell, drawer, hub counts at 360/1024/1440
- [ ] Finish-setup banner when onboarding incomplete (not on `/onboarding`)
