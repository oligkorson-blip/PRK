# Parkwise composition redesign — design (board-approved)

**Date:** 2026-07-20  
**Scope:** B — composition redesign + selective visual refresh (Approach 1)  
**Status:** APPROVE WITH FIXES — corrections locked below after board review  
**Brand:** Keep forest / cream / coral / lime, Manrope + Fraunces. No second visual language.

## Super prompt (execution)

```text
You are a senior frontend product-design team for Parkwise apps/web.
Redesign important compositions for hierarchy and conversion.
Keep brand tokens. Primary CTA = View opportunities. Capital at risk near CTAs.
Apply-first for guests. Full-bleed marketing heroes; no card-heavy first viewport.
Hero budget: brand + one headline + one support + one CTA group + one atmosphere.
Named motions (2–3) + prefers-reduced-motion. Prefer fewer sections over decoration.
```

## Atmosphere decision (mandatory)

**Ship: branded full-bleed CSS/SVG scene** for marketing heroes (no photo licensing dependency).  
Optional enhancement: when an asset has `coverImageUrl`, catalogue/detail may use it; home hero does **not** depend on DB images.  
Fallback: existing brand greens/cream gradient + subtle lot geometry (extend `marketing-art` / hero CSS). Never ship an empty hero.

## Chrome stacking (mandatory)

Order top → bottom:
1. `DemoBanner` (if `DEMO_MODE=true`)
2. Optional onboarding banner (signed-in incomplete)
3. Site header (`--header-h`)
4. Home `status-bar` (capital at risk / not regulated fund marketing) — **keep**
5. Page content / full-bleed hero

Hero sits **below** status-bar (not under chrome). Account for height in first-viewport composition. Keep `scroll-padding-top` coherent with header.

## Home — exact section map

**Keep chrome:** DemoBanner? → header → status-bar.

| # | Section | Content |
|---|---------|---------|
| 1 | **Hero** | Parkwise brand signal in composition (wordmark/mark, not nav-only) + `CAMPAIGN_HEADLINE` + `CAMPAIGN_SUPPORT` + primary **View opportunities** + secondary **How it works** + `RISK_LINE`. Full-bleed branded atmosphere. **No** featured asset card, funding bar, yield stats, Open/Full badges, chips. |
| 2 | **Live opportunities** | 3 `AssetCard`s + View all → `/opportunities` (SEO + proof; replaces hero card) |
| 3 | **How investing works** | Single merged 3–4 step narrative (one story only) |
| 4 | **Why parking** | One short claim + link to `/why-parking` — **no** demand-chip cloud |
| 5 | **Risks** | Risk panel + link to `/legal/risk` |
| 6 | **Closing CTA** | View opportunities + Create account + `RISK_LINE` |

### Explicitly DELETE from home

- Featured asset card inside hero  
- Trust-strip duplicate of benefits  
- Income simulator on home  
- Second benefits / diligence card grids  
- Guides teasers block  
- Home FAQ accordion block  
- Demand chips  
- Separate “model works” + “four steps” double stack (merge into §3)  

### Must retain (compliance / conversion)

- Status-bar disclaimer  
- `RISK_LINE` near CTAs  
- Campaign qualifier next to earn claims  
- Primary CTA → `/opportunities`  
- Path to `/apply` in closing CTA  
- Risks section or equal prominence  
- Target-return honesty wherever yields appear  
- JsonLd organization + website  
- ≥3 linked opportunities below fold  

### Motion (home)

1. Hero content fade/rise on load  
2. CTA primary subtle emphasis  
3. Opportunities rail stagger or soft entrance  
Respect `prefers-reduced-motion`.

## Opportunities catalogue

1. Short page intro (page-hero, brand-consistent)  
2. **Filters + grid first** (browse immediately)  
3. Tier primer **demoted**: collapsed `<details>` below grid, or short link to how-it-works — not a card wall above the fold  
4. Default emphasis: prefer open opportunities (default `fundingFilter` open or sort open-first) without hiding Full  

## Opportunity detail

1. Keep conversion gates: `termsSeen`, sticky/mobile CTA, risk ack, Full-funded state  
2. Jump nav **reduced IDs only** (existing anchors; fold content, don’t orphan):  
   - `#overview` (fold location / revenue / management into overview prose)  
   - `#returns`  
   - `#fees`  
   - `#risks`  
   - `#documents`  
   FAQ: keep section but drop from jump nav (or single link under overview)  
3. Clearer signed-out path: Create account → `/apply` with option context preserved where possible  
4. Media: cover image dominant when present; no overlay promo badges on gallery  

## Portal overview

**Two compositions:**

| State | Composition |
|-------|-------------|
| Empty / no holdings | Access timeline + one next action first; no fake KPI wallpaper |
| Active portfolio | Compact KPIs + holdings + income-received vs target; keep `RISK_LINE` / holding meaning |

Do not turn portal into a marketing landing.

## Polish pages (not full redesign)

- **How it works / Why parking / About:** one job per section; fewer cards; less CTA spam; link home for deep browse  
- **Apply:** stronger trust/progress framing; keep wizard; `RISK_LINE` near submit path  

## Out of scope

- Palette/type rebrand  
- Admin CMS redesign  
- Copy policy changes beyond structure  
- Licensed photo procurement  

## Done when

- Home matches the 6-section map; hero passes brand + budget tests  
- Catalogue browse-first; tier primer demoted  
- Detail jump nav ≤5; gates intact  
- Portal empty vs active compositions distinct  
- Smoke 360 / 768 / 1280 on home, catalogue, detail, portal, apply  
