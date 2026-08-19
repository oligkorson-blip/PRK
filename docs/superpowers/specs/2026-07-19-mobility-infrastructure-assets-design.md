# Mobility infrastructure thesis — parking-primary multi-income assets — Design

**Date:** 2026-07-19  
**Status:** Approved (brainstorm 2026-07-19); enhanced 2026-07-19  
**Depends on:** Existing `assets` catalogue, seed pipeline, marketing/portal/admin UX program (`2026-07-19-full-platform-ux-program-design.md`)

## Goal

Reposition Parkwise as **mobility infrastructure finance**: investors finance **parking assets** operated in the style of major European parking groups. On **some** sites, contracted income also includes ancillary services (EV charging, bicycle storage, parcel lockers, vehicle cleaning, etc.). That stack is safer than relying exclusively on private-car parking as European cities tighten curb policy and push active mobility, public transport, and zero-emission logistics.

**One-line thesis:** Buy or finance parking infrastructure that can become a mobility and energy asset — parking first, extras where they already exist.

## Decisions locked

| Topic | Choice |
|---|---|
| Scope | Full thesis rebuild: marketing + product model + ops display + new seed |
| Brand | Keep **Parkwise**; product frame **Mobility infrastructure finance** |
| Income depth | Fixed stream taxonomy + % mix on the asset (`income_mix` JSON) |
| Investment core | **Parking-primary** — every listed asset is a parking hub |
| Mix rule | `vehicle_parking` always present and **≥ any other single stream**; ancillaries only where the site story fits |
| Catalogue | **Replace** current seed; **≥ 24 hubs** (target **24–30**) |
| Operators | INDIGO, Q-Park, APCOA, Effia, Euro Car Parks, Interparking |
| Realism | Named real-location patterns (city / station / airport / retail); yields, occupancy, and mix are **illustrative demo targets** |
| Data approach | `assets.income_mix` JSONB + typed taxonomy in code |
| Admin mix editor | Out of scope v1 (read-only from seed) |

## Why this thesis (product narrative)

European urban-mobility policy increasingly treats parking and curb management as part of wider sustainable-mobility planning. Pure private-car income is more exposed to:

- Reduced city-centre parking supply and tighter access rules  
- Modal shift to transit, walking, and cycling  
- Electrification and shared mobility requirements on existing facilities  

A parking facility that already hosts **EV charging**, **bike storage**, **lockers**, or **fleet/last-mile** uses has more than one contractual demand driver. Parkwise presents that as **illustrative income mix** on the asset — not as a guarantee and not as operator-reported accounts.

## Stream taxonomy

| ID | Label | Typical site fit |
|---|---|---|
| `vehicle_parking` | Vehicle parking | **Required on every asset** |
| `ev_charging` | EV charging | City, retail, workplace, transit — most common ancillary |
| `bicycle_storage` | Bicycle storage | Transit hubs, dense city centres |
| `parcel_lockers` | Parcel lockers | Retail, residential-edge, transit |
| `car_sharing` | Car-sharing spaces | City centres, residential catchments |
| `micromobility_charging` | Scooter and bicycle charging | City / transit / campus |
| `last_mile_logistics` | Last-mile logistics | Rail / urban logistics edge |
| `vehicle_cleaning` | Vehicle cleaning | Larger retail / premium city parks |
| `fleet_parking` | Fleet parking | Airports, logistics, B2B-heavy sites |

### Validation rules (seed + shared helper)

1. Every `id` ∈ taxonomy  
2. Every `pct` is a number, `pct > 0`  
3. `sum(pct)` ∈ `[99.5, 100.5]`  
4. `vehicle_parking` present  
5. `pct(vehicle_parking) ≥ pct(s)` for every other stream `s`  
6. Prefer 1–4 streams total (parking-only is allowed; 5+ streams only for flagship hubs)

### Example mixes

**Parking-only (allowed):**

```json
[{ "id": "vehicle_parking", "pct": 100 }]
```

**Common multi-income (station / city):**

```json
[
  { "id": "vehicle_parking", "pct": 72 },
  { "id": "ev_charging", "pct": 18 },
  { "id": "bicycle_storage", "pct": 10 }
]
```

**Retail flagship:**

```json
[
  { "id": "vehicle_parking", "pct": 65 },
  { "id": "ev_charging", "pct": 15 },
  { "id": "parcel_lockers", "pct": 12 },
  { "id": "vehicle_cleaning", "pct": 8 }
]
```

## Operator roster (illustrative partner content)

Use these profiles on About / Partners. Stats are **marketing figures for the demo**, not live verified feeds.

| Operator | Positioning | Footprint (demo copy) | Countries (demo focus) | Proof points |
|---|---|---|---|---|
| **INDIGO** | Global leader in parking and mobility | 5,400+ parkings · 2.3M+ spaces · 10 countries · 19,000+ employees | France, Spain, Belgium, Netherlands (+ note Canada/Brazil globally) | #1 worldwide · Euronext-listed · 50 years · EV mobility pioneer |
| **Q-Park** | European premium parking expert | 3,600+ parkings · 900K+ spaces · 7 countries · 6,000+ employees | Netherlands, Germany, Belgium, France, UK, Ireland, Denmark | Northern European leader · premium quality · tech · sustainability |
| **APCOA** | Leading parking operator in Europe | 12,000+ parkings · 1.5M+ spaces · 13 countries · 5,000+ employees | Germany, Austria, Switzerland, Italy, UK, Poland, Scandinavia | #1 DE/AT · airport leader · B2B · technology |
| **Effia** | SNCF subsidiary specialised in parking | 350+ parkings · 180K+ spaces · France · 1,200+ employees | France | Station/transit expertise · SNCF Gares & Connexions · intermodal |
| **Euro Car Parks** | UK & Ireland market leader | 1,500+ parkings · 180K+ spaces · 2 countries · 1,500+ employees | United Kingdom, Ireland | Retail & airport · ANPR · 40+ years |
| **Interparking** | Pan-European premium operator | 950+ parkings · 437K+ spaces · 9 countries · 2,400+ employees | Belgium, France, Netherlands, Germany, Austria, Spain, Italy, Romania, Denmark | Since 1958 · city-centre · ISO 14001 · tier-one footprint |

## Site archetypes → stream guidance

| Archetype | Operators often used | Default streams |
|---|---|---|
| Rail / major station | Effia, INDIGO, Interparking | Parking + EV + bike storage (± lockers) |
| Airport | APCOA, Euro Car Parks, INDIGO | Parking + EV + fleet (± cleaning) |
| City-centre premium | Q-Park, Interparking, INDIGO | Parking + EV (± car-share, micromobility) |
| Retail / shopping | Euro Car Parks, Q-Park, APCOA | Parking + EV + lockers (± cleaning) |
| Urban logistics edge | INDIGO, APCOA | Parking + last-mile (± fleet) |

Roughly **60–75%** of seeded hubs should have ≥1 ancillary; **25–40%** remain parking-only for contrast.

## Data model

### Migration

Add to `assets`:

| Column | Type | Notes |
|---|---|---|
| `income_mix` | `jsonb` not null | Default temporarily `[{ "id": "vehicle_parking", "pct": 100 }]` only if needed for migrate-then-seed; prefer seed rewrite immediately after migrate |

No change to interests, holdings, or documents schema beyond cascade cleanup of replaced assets.

### Seed JSON shape (extends today’s static rows)

```json
{
  "id": "effia-gare-du-nord",
  "name": "Effia Gare du Nord",
  "operator": "Effia",
  "city": "Paris",
  "district": "Paris 10",
  "country": "France",
  "yield": 8.1,
  "tier": "Premium",
  "from": 12500,
  "spaces": 540,
  "occupancy": 97.2,
  "lease": "15 years",
  "art": 1,
  "siteType": "station",
  "blurb": "…",
  "incomeMix": [
    { "id": "vehicle_parking", "pct": 70 },
    { "id": "ev_charging", "pct": 20 },
    { "id": "bicycle_storage", "pct": 10 }
  ]
}
```

`siteType` is seed-only metadata (optional column or ignored at insert) to keep blurbs consistent; if not stored in DB, keep it in JSON for authors only.

### Seed composition target (≥24)

| Operator | Min hubs | Notes |
|---|---|---|
| INDIGO | 4–5 | FR/ES/BE/NL mix; EV pioneer story |
| Q-Park | 4–5 | NL/DE/BE/FR/UK premium city |
| APCOA | 4–5 | DE/AT/CH/IT airport + retail |
| Effia | 3–4 | French stations only |
| Euro Car Parks | 3–4 | UK/IE retail & airport |
| Interparking | 4–5 | BE + multi-country city centres |
| **Total** | **24–30** | |

Replace — do not merge with — the previous 12-asset seed.

## Demo reset procedure

When replacing assets:

1. Migration adds `income_mix`.  
2. Seed script **deletes** interests and holdings that reference asset IDs/slugs being removed (or truncates demo interests/holdings before re-insert).  
3. Upsert/replace all catalogue assets from new JSON; all `status = published` for demo.  
4. SETUP.md / verify doc: “Re-seed wipes demo interests/holdings tied to old catalogue.”

Do not silently leave orphan holdings pointing at deleted assets.

## Product surfaces

### Brand chrome

- Product frame under or beside Parkwise where appropriate: **Mobility infrastructure finance**.  
- Do not rename the company mark.

### Marketing pages

| Page | Intent |
|---|---|
| Home | Hero: parking infrastructure that hosts mobility & energy services; CTA to opportunities |
| Why parking → retitle emphasis | Keep URL `/why-parking`; headline shifts to why **parking infrastructure** remains investable *and* how ancillaries hedge policy risk |
| How it works | Unchanged mechanics; diligence pack includes income-mix review |
| About / partners | Six operator cards with stats above + disclaimer |
| Documents / legal | No substance rewrite; risk pages already cover capital at risk |

### Catalogue (`/opportunities`)

**Card**

- Name, location, operator, tier  
- Target yield, min ticket, **spaces**  
- Ancillary badge row (icons or short labels) when `incomeMix` has streams other than parking  
- Optional subtle “Multi-income” chip if ancillaries ≥ 1  

**Filters** (client-side on loaded catalogue)

- Tier, city (existing)  
- Operator (exact match on `operator` string)  
- Has EV (`ev_charging` in mix)  
- Multi-income (any non-parking stream)

**Lead copy:** “Parking assets across Europe. Some sites include extra contracted revenue — EV, bikes, lockers, and more.”

### Opportunity detail

1. Existing hero + facts (spaces, occupancy, lease, operator)  
2. **Income mix** section  
   - Stacked bar (parking + ancillaries) using brand greens/lime  
   - Legend with label + pct  
   - One sentence: “Illustrative share of contracted target income — not a guarantee.”  
3. Blurb explains site archetype and why extras appear  

### Admin

- Assets table: column or secondary line “Mix: Parking 70% · EV 20% · …”  
- Detail: same mix panel as public (read-only)  
- No editor in v1  

### Portal

- No new portal IA  
- Holdings/interest cards can omit mix; detail link remains source of truth  

## Canonical disclaimer (use verbatim or near-verbatim)

> Parkwise is a demonstration platform and does not offer a real investment service. Operator names and location patterns are used for illustrative catalogue context only and do not imply partnership, endorsement, or an offering by those operators. Target yields, occupancy, and income-mix percentages are contractual illustrative targets for this demo — not guarantees and not operator-disclosed financials. Capital at risk.

Place: footer risk band (already demo-aware), partners section, opportunity detail near yield/mix, and seed/SETUP notes for operators.

## Out of scope (v1)

- Brand rename  
- Live operator APIs, scrapers, or claimed real-time occupancy  
- Normalized `asset_income_streams` table  
- Per-stream yield / occupancy / capacity fields  
- Admin WYSIWYG mix editing  
- Securities, prospectus, or regulated marketing claims  
- Claiming SNCF/Indigo/etc. endorsement  

## Success criteria

1. Old seed assets are gone; **≥ 24** new parking-primary hubs published.  
2. Every asset has valid `income_mix` enforcing parking-primary rules.  
3. **~60–75%** of hubs show ≥1 ancillary badge; parking-only hubs still exist.  
4. Home + why-parking communicate diversified parking-infrastructure thesis.  
5. Six operator partner profiles + canonical disclaimer are visible.  
6. Catalogue filters: operator, Has EV, Multi-income work on loaded data.  
7. Detail income-mix panel renders correctly for parking-only and multi-income.  
8. Admin shows mix read-only; publish/close still works.  
9. Unit tests cover mix validation (valid, sum fail, missing parking, parking not dominant).  
10. Seed fails fast on invalid mix; SETUP documents demo interest/holding wipe.

## Testing

| Layer | Cases |
|---|---|
| Unit | Taxonomy validation edge cases |
| Seed | Dry-run or test harness validates all JSON rows before DB write |
| Manual | Catalogue filters; detail mix; partners disclaimer; admin asset row after re-seed |

## Implementation sketch (for writing-plans)

1. `lib/assets/income-streams.ts` — taxonomy, labels, `validateIncomeMix`, `hasEv`, `isMultiIncome`, `formatMixSummary`  
2. Unit tests for validation  
3. Drizzle migration `income_mix`  
4. Author `seed-data.json` (24–30 hubs) + seed cleanup of interests/holdings/old assets  
5. Marketing: home, why-parking, how-it-works touch, about/partners  
6. Catalogue badges + filters; detail mix UI (CSS in `globals.css`)  
7. Admin read-only mix  
8. SETUP + verify checklist updates  

## Open product notes (non-blocking)

- Exact 24 vs 30 count can flex during seed authoring as long as ≥24 and operator mins are met.  
- `/why-parking` URL kept for SEO/bookmarks; page title/H1 may say “Why parking infrastructure”.  
- Visual companion mockups optional at implement time for mix bar polish.  
