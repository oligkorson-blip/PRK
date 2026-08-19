# Parkwise productization — live platform UX, legal, asset detail

**Status:** Enhanced draft for user review (rev 5 — CPO P0 closure)  
**Date:** 2026-07-19  
**Approved directions:** Hybrid **C**; no GPT lingo; invite-only live surface; apply-first companion  
**Companion:** `2026-07-19-apply-first-ux-design.md`  
**References:** Static HTML; 21 VH detail structure; Parkwise mockup PNG  
**Prior:** Rev 4 failed CPO review — packaging without product object. This rev closes P0s only.

## Goal

Ship an **invite-only investor platform** for continental parking / mobility hub **allocations**: honest posture line, inlined Hybrid C terms, provenance-safe asset metrics, 21 VH–style decision pages, apply-first access, and a thin Guides set that supports the product — not a macro blog farm.

## Expert revision notes

### Rev 5 (this pass) — CPO P0 closure

| P0 | Fix in this rev |
|---|---|
| Product object undefined | **Locked product object** + cash/ops lifecycle |
| Hybrid C ghost | **Full term catalogue + Risk mapping** inlined |
| Live voice vs stub ops | **Posture line**: invite-only allocation platform; no AIF claim |
| “Subscription” lexicon | Replaced with **allocation / option / holding** |
| Named operators vs non-endorse | **Operator naming policy** A/B |
| Catalogue metrics unsourced | **Metric provenance** + hide if `withheld` |
| CTA before terms (mobile) | **Terms before primary CTA**; Risk ack on interest |
| Guides overbuilt | Cut to **3** pieces (1 flagship + 2 literacy) |
| Recommend → Green/Premium | Default **Standard**; Recommended only if ops sets it |
| Success = checklist | Add counsel + provenance + ops SLA gates |

### Earlier revs (kept)

Rev 2: geo backfill, option math, `optionId`, Green/buyback rules, net/year.  
Rev 3: journeys, card hierarchy, blurb formula.  
Rev 4: Guides KPI bank / cite rules (slate cut in rev 5).

---

## Locked decisions

| Topic | Choice |
|---|---|
| Posture | **Invite-only allocation platform** — not a UCITS/AIF solicitation UI |
| Product object | See Part 0A (mandatory) |
| Guarantees | Hybrid **C** — commercial bullets + Risk qualifications (inlined below) |
| Copy | Agency tone; no GPT lingo; **no “subscription”** in investor UI |
| Asset detail | 21 VH structure with provenance + terms-before-CTA |
| Geo | No UK / Netherlands / Poland published; Ireland kept; **reason disclosed** (Part 3) |
| Regulated-fund badge | Forbidden |
| Apply-first / KYC | Companion; KYC after approval in dashboard |
| Interest ↔ option | `optionId` required when options exist |
| Recommended option | **Standard** by default; Green/Premium only if `recommended: true` set in seed/ops |
| Guides | 3 pages; primary-source KPIs only |
| Operator names | Policy A default; Policy B with consent |

### Posture line (every marketing shell + footer)

> Parkwise is an invite-only platform for parking and mobility hub allocations. Access is by application. Figures are contractual targets under Parkwise Terms. Capital at risk. Parkwise does not present itself as a UCITS or AIF on this site.

Counsel may shorten; eng must not invent a softer line.

### Banned phrasing

Avoid: unlock, elevate, seamless, leverage, empower, cutting-edge, revolutionize, demo platform, placeholder, “illustrative catalogue”, “illustrative mix stacks”, “framed around”, **subscription** (investor UI), **guaranteed rent**, regulated fund / AMF claims.  
Prefer: allocation, option, holding, operator, city, spaces, contractual target, monthly income, apply, capital at risk.

(“User journey” in internal specs is fine; do not put “journey” in visitor copy.)

### Personas

| Persona | Pain | We show |
|---|---|---|
| Time-poor HNWI | Vague pitches | One card → one decision page → Apply |
| Family office analyst | Soft numbers | Provenance + options math + Risk schedule |
| Operator-familiar allocator | Who runs the site? | Naming policy A/B + lease-style terms |
| Ops / compliance (internal) | Ambiguous states | Apply-first machine + confirm gates |

---

## Part 0A — Product object (P0)

### What the investor is looking at

| Stage | Object | Binding? | Money moves in v1 software? |
|---|---|---|---|
| Browse | Published **hub opportunity** + **allocation options** | No | No |
| Apply | **Application** → `pending_access` | Application only | No |
| Express interest | **Interest** on a hub + `optionId` + amount | **Non-binding** indication | No |
| Ops confirm | **Holding** | Contractual record under Parkwise Terms + selected option terms | **No automated payout / custody in v1** |
| Later (out of scope) | Banked settlement / AIF wrapper | Counsel + ops systems | Yes — not this release |

**One sentence (locked):**  
Parkwise records **non-binding interest** in a named hub **allocation option**, which operations may confirm into a **holding** — a contractual allocation record under Parkwise Terms — without claiming a licensed fund or automated cash settlement in v1.

### Counterparty (defaults until counsel pack)

| Role | Default |
|---|---|
| Platform / contracting name | Parkwise |
| Governing law | Ireland |
| Site operations | Named or patterned **operator** (policy A/B) — lease / ops context, not endorsement |
| Investor | Natural person or company on the application |

Holdings are **platform allocation records**, not units of a UCITS/AIF, unless a later counsel-approved structure says otherwise (out of scope).

### Cash / ops lifecycle (honest)

```text
Apply → invite → sign-in → onboarding
  → Express interest (option + amount)     [non-binding]
  → KYC approved (required before confirm)
  → Ops confirm → Holding created          [contractual record]
  → Payouts / wires                        [OUT OF SCOPE v1 — manual offline if any]
```

UI must not imply instant funding, custody, or guaranteed monthly cash.

---

## Part 0 — End-to-end user flows

### Flow A — New visitor → application

```text
Land → Apply (/apply) 3 steps → Confirmation
  → Cannot sign in until ops invite
```

| Screen | Primary CTA | Secondary |
|---|---|---|
| Home | View opportunities | Apply |
| Opportunities | Open asset card | Apply (header) |
| Asset (logged out) | **Apply to allocate** | Sign in |
| Apply done | View opportunities | Read flagship guide (soft) |
| Sign-in (pending) | “Your application is under review.” | — |

### Flow B — Ops unlock → first login

Ops Approve & invite → set password → sign in → onboarding → Dashboard.

**Ops SLA (product target):** invite decision within **5 business days** of complete application (measure in admin; copy may say “usually within a few business days”).

### Flow C — Explore & express interest

Select option → Express interest (default amount = option minimum) → Interests: Pending.

KYC not required for C. Banner if pending interests and KYC ≠ approved:  
`Finish KYC so we can confirm an allocation when you’re ready.` → `/portal/kyc`

Interest confirmation screen must state: **This is not a binding commitment or a funded position.**

### Flow D — KYC → confirm → holding

KYC submit → ops approve KYC → ops confirm interest → Holding + Overview update.

### Flow E — Blocked / recovery

| State | User sees |
|---|---|
| Application pending | Sign-in: under review |
| Application rejected | May re-apply; polite decline path |
| Invite expired | Request new invite via advisor / support |
| Suspended | Contact support |
| Interest pending, KYC open | Banner → KYC |
| Confirm blocked | Admin: KYC not approved |

### Nav truth (logged out)

| Item | Goes to |
|---|---|
| Opportunities | `/opportunities` |
| How it works | `/how-it-works` |
| Guides | `/guides` |
| Apply | `/apply` |
| Sign in | `/sign-in` |

**Why parking:** fold into Guides as entry to flagship (no separate primary nav item).

---

## Part 1 — Voice & anti-demo

1. No visitor “demo platform” theatre.  
2. Always: posture line + capital at risk + contractual targets.  
3. Operators: naming policy A/B; legal non-endorsement always.  
4. `DEMO_MODE` = staging/ops only.  
5. README/SETUP = production + staging appendix + bootstrap before public `/apply`.

---

## Part 2 — Legal suite + Hybrid C (inlined)

### Pages

| Route | Purpose |
|---|---|
| `/legal/terms` | Platform terms & **allocation** framework |
| `/legal/privacy` | Privacy (GDPR structure) |
| `/legal/risk` | Risk disclosure + **Hybrid C term schedule** |
| `/legal/cookies` | Cookie notice |
| `/legal/complaints` | Complaints (ack within 5 business days) |

Documents hub links these + real files only — **no empty PDF tiles**.

Header on legal pages: counsel should review before regulated offers in a given jurisdiction.

### Entity defaults

| Item | Default |
|---|---|
| Contracting name | Parkwise |
| Law / courts | Ireland |
| Contact | Published ops contact on About |

### Hybrid C — commercial term catalogue

**UI:** bold commercial bullets on asset / option.  
**Legal:** each id has a Risk subsection: meaning / not meaning / failure modes.  
**Forbidden UI id:** `regulated_fund_eu`.

| Id | UI label (commercial) | Typical on |
|---|---|---|
| `triple_net` | Triple-net style operator lease | Usually all |
| `contractual_monthly_rent` | Contractual monthly income under the lease | All |
| `buyback_at_par` | Buyback terms at allocation value where included | Premium and/or Green when seed says so |
| `indexation_floor` | Indexation per lease (floor where stated) | Where lease supports |
| `parkwise_protections` | Investor protections under Parkwise Terms & Risk | All |
| `flexible_term` | Flexible term bands (1–30 years where offered) | All |

Asset or option lists a subset via `commercialTermIds`. Buyback **never** shown unless that option includes `buyback_at_par`.

### Lexicon (investor UI)

| Do not say | Say |
|---|---|
| Subscription / subscribe | Allocation / allocate / option |
| Guaranteed rent | Contractual monthly income (target) |
| Regulated fund | — (omit) |
| Holding (ok) | Holding = confirmed allocation record |

---

## Part 3 — Asset data, provenance, detail UX

### Geo

No published hubs in **United Kingdom, Netherlands, Poland**. Ireland kept.  
**Investor-facing reason (Opportunities or FAQ one-liner):**  
`This release lists continental hubs outside the UK, Netherlands, and Poland.`  
Internal: catalogue focus / ops coverage — not a claim those markets are unsafe.

After cut: backfill **≥24** hubs; rebalance operators under naming policy.

### Metric provenance (P0)

Every display metric that is not pure inventory (`spaces`) carries provenance:

| Provenance | Meaning | UI |
|---|---|---|
| `contracted` | From lease / operator pack Parkwise will stand behind in Terms | Show number + quiet “Contracted figure” |
| `modelled` | Internal model for catalogue decisioning | Show number + quiet “Modelled figure — not audited accounts” |
| `withheld` | Not published | **Do not show the number** — omit stat or “Available after access” |

**Seed v1 default:** `visitorsPerDay` and `annualRevenueEur` = `modelled` unless a real pack exists.  
Guides rule still applies: do not invent city tourism stats as “facts.”

### Schema (assets) — additive

| Field | Type | Notes |
|---|---|---|
| `visitorsPerDay` | int nullable | Null if withheld |
| `visitorsProvenance` | enum | contracted \| modelled \| withheld |
| `availableSpaces` | int not null | ≤ `spaces` |
| `annualRevenueEur` | int nullable | Null if withheld |
| `revenueProvenance` | enum | contracted \| modelled \| withheld |
| `commercialTermIds` | jsonb | catalogue ids |
| `investmentOptions` | jsonb | options below |
| `operatorDisplay` | jsonb | `{ mode: "named"\|"pattern", label, legalName? }` |

### Option object

```json
{
  "id": "standard",
  "label": "Standard option",
  "recommended": true,
  "minTicketEur": 11400,
  "yieldPct": 7.8,
  "monthlyIncomeEur": 74,
  "annualIncomeEur": 889,
  "commercialTermIds": ["triple_net", "contractual_monthly_rent", "indexation_floor", "parkwise_protections", "flexible_term"]
}
```

Ids: `standard` | `premium` | `green` (green optional).  
**Default `recommended`:** Standard only. Green only if EV in mix (or `supportsGreen`).  
Math validators unchanged (rev 2): income ↔ yield × ticket; Standard ≤ Premium ≤ Green yields.

### Interests

`optionId` required when options exist; confirm copies that option’s yield into holding.

### Detail page — scroll story

**Desktop order:**

1. **Hook** — Operator display · Name · Location · Yield band  
2. **Proof** — Stats with provenance microcopy (skip withheld)  
3. **Terms** — Included commercial bullets + Risk link  
4. **Choose** — Standard / Premium / Green  
5. **Act** — Sticky CTA  
6. **Context** — Blurb · Income mix · Lease length  

**Mobile order (P0):** hook → proof → **terms** → choose → **act** → context.  
Do **not** place primary CTA above terms on mobile.

### Sticky summary

Option label · From {ticket} · Target {yield}% · Target monthly {€} · Primary button.

### CTA + Risk ack

| State | Primary | Secondary |
|---|---|---|
| Logged out | Apply to allocate | Sign in |
| Onboarding incomplete | Finish onboarding | — |
| Eligible | Express interest | — |

Under CTA: `Capital at risk. Figures are contractual targets, not guarantees.`  
On Express interest submit: checkbox `I understand this is non-binding and I have read the Risk Disclosure` (link).

---

## Part 4 — Asset marketing copy (cards & pages)

### Voice

Senior real-assets desk. Place + operator display. One demand driver. EV/lockers only if in mix. Risk in footer line, not inside blurb.

### Operator naming policy

| Mode | When | Card / detail kicker |
|---|---|---|
| **A — Pattern (default)** | No written consent | e.g. `National parking operator · France` |
| **B — Named** | Written consent on file | e.g. `INDIGO` + Terms non-endorsement |

Seed may keep real names in **ops-only** fields; **public** `operatorDisplay` follows A until consent flagged.  
Blurbs must not imply partnership.

### Catalogue card hierarchy

```text
[Schematic art]
[Operator display]            ← policy A/B
Name
City, Country
Spaces · site type word
────────
Yield band or primary %
From €X
Contractual target. Capital at risk.
```

Max 2 badges (site type, EV). No long stream names on cards.

### Labels

| UI label | Meaning |
|---|---|
| Target return | Contractual target % on option ticket |
| From | Minimum ticket |
| Visitors / day | Throughput — show only if not withheld; provenance microcopy |
| Available spaces | Spaces in this allocation |
| Annual revenue | Site revenue — show only if not withheld; provenance microcopy |
| Monthly / annual income | Contractual target on the ticket |

Card disclaimer: `Contractual target. Capital at risk.`

### Card yield

Band span &lt; 0.5 pp → single %; else `7.8% → 12.4%` with `Target return`. Never “up to” without floor.

### Blurb formula

`{Demand driver}. {Operator display} runs the site. {Parking-primary;} {optional ancillary}.`  
≤ ~220 chars. Ban: illustrative, demo, world-class, unique opportunity, subscription.

Examples use **pattern** operators until Policy B:

- `Rail-side parking for TGV and RER traffic. A national parking operator runs the site. Income is parking-led, with EV charging in the mix.`

### Detail microcopy

| Element | Copy |
|---|---|
| Included terms | `Included under this allocation` |
| Terms footnote | `What each line means — and when it does not apply — is in the Risk Disclosure.` |
| Options heading | `Choose an allocation option` |
| Recommended | `Recommended` (only if flag true) |
| Green | `Green option — EV charging` |
| CTA logged out | `Apply to allocate` |
| CTA eligible | `Express interest` |
| Risk under CTA | `Capital at risk. Figures are contractual targets, not guarantees.` |

### Options help lines

| Id | Title | Help |
|---|---|---|
| standard | Standard option | Core parking allocation |
| premium | Premium option | Higher ticket, higher target return |
| green | Green option — EV charging | Includes contracted EV income |

### Opportunities index (locked)

- **Kicker:** `Opportunities`  
- **H1:** `Parking hubs across continental Europe.`  
- **Lead:** `Each listing is parking-primary, operated under a lease-style structure, with a published target return. Open a hub to compare allocation options.`  
- Geo one-liner as above.  
- Empty: `No published hubs right now. Apply if you want to be notified when the next release goes live.`

### Home

Brand H1 kept. Lead: parking infrastructure + contractual targets + human onboarding. CTAs: View opportunities · Apply.

---

## Part 5 — Wider marketing pages

| Page | Direction |
|---|---|
| How it works | Application → allocation record; simulator with counsel-ready disclaimer |
| Guides | Index + 3 articles |
| About | Who runs Parkwise; operator policy; posture line |
| Documents | Legal links + real files |

Simulator: `Run your own numbers.` Must use **selected option contractual targets only** — not free-form yield invention. Disclaimer: contractual targets; capital at risk; not a forecast of personal return after tax.

---

## Part 6 — Alignment with apply-first

Productization owns visitor voice + asset lexicon. Apply-first owns access state machine.  
Asset CTAs match Flows A/C. KYC banner mandatory when relevant.  
Interest remains allowed pre-KYC; confirm→holding still requires KYC `approved`.

---

## Part 7 — Guides (cut slate)

### Purpose

Answer “why look at hubs in 2026?” with checkable facts, then hand off to Opportunities / Apply.  
Never imply Parkwise yields from macro KPIs.

### Ship v1 (3 only)

| # | Slug | Title | Job |
|---|---|---|---|
| 1 | `european-parking-and-mobility-2026` | European parking & mobility hubs in 2026 | Flagship conviction brief |
| 2 | `how-hub-income-is-stacked` | How a mobility hub earns | Product literacy |
| 3 | `how-to-read-a-parkwise-opportunity` | How to read a Parkwise opportunity | UX companion |

AFIR / EV-gap / cars-still-here become **sections inside #1**, not separate URLs.

### Editorial rules

Unchanged: primary sources; figure·unit·geo·as-of·source·link; no invented rounding; bridge line ≠ yield claim; footer not-a-forecast; ban-list.

### KPI bank

Keep rev 4 bank (Eurostat / EAFO / AFIR / ACEA labeled). **Delete Mordor** from launch copy.

### Placement

Nav Guides · asset Further reading (max 1 link to #1 or #3) · apply soft link to #1 · empty dashboard → #3.

### Index copy

- **H1:** `Guides`  
- **Lead:** `Public figures and plain explanations — so you can check the thesis before you apply.`

---

## Out of scope

- Live AIF / prospectus filing · Operator APIs · Banked payouts / custody · Real KYC vendor · SMTP (v1 skip-log)  
- 21 VH dark theme · Fake regulated-fund badge · Fake PDFs · Full CMS  
- Policy B operator rollout without consent files  

---

## Success criteria

1. Product object + posture line visible on home, opportunities, asset, apply  
2. No investor-facing “subscription” / regulated-fund / guaranteed-rent  
3. Hybrid C ids on assets map to Risk subsections  
4. Metric provenance enforced; withheld stats not shown  
5. Operator public display respects policy A/B  
6. Mobile: terms before primary CTA; interest Risk ack  
7. Journeys A–E + blocked copy; `optionId` + option math  
8. No UK/NL/PL; ≥24 hubs; Recommended default Standard  
9. Guides: exactly 3; KPI bank spot-check passes Google  
10. Counsel has skimmed Terms/Risk outline before public `/apply`  
11. Ops invite SLA measurable in admin (target 5 business days)

## Implementation phases

1. Spec approval (rev 5)  
2. Schema: options, provenance, operatorDisplay, optionId  
3. Seed: geo cut/backfill, policy A operators, modelled metrics, blurbs  
4. Cards + detail UI (terms-before-CTA) + interest ack  
5. Legal suite + Hybrid C schedule  
6. Flow copy + posture line + anti-demo sweep  
7. Guides (3) + Cite component  
8. HTML P0 + mobile QA  

## Defaults

| Topic | Default |
|---|---|
| Law | Ireland |
| Net/year | Contractual target on ticket, pre-personal-tax |
| Primary / recommended option | `standard` |
| Card badges | Site type + EV max |
| Home secondary CTA | Apply |
| Guides | 3 URLs |
| Operator public mode | Pattern (A) |
| Visitors / revenue | modelled or withheld — never unlabeled |
| KPI preference | Eurostat / EAFO / EC / ACEA |
