# Help Me Choose — Design

Date: 2026-07-29  
Status: Approved  
Scope: `apps/web` public guided preference flow at `/help-me-choose`

## Intent

Give visitors a calm, skippable, **one-question-at-a-time** path that returns up to
three academy opportunities with a short factual “why this appeared” line each.
The flow is **non-advisory**: preferences narrow browsing; they do not claim
suitability, recommendation, or personalised advice.

## Decisions

| Choice | Decision |
|--------|----------|
| Placement | Dedicated route `/help-me-choose` (not catalogue modal) |
| Depth | Four steps; each skippable |
| UX | Guided one-question stage (full calm canvas, large choices, progress) |
| Matching | Pure function over published assets; no new DB |
| Asset pool | Published + catalogue **open** only (`status.id === "open"`) |
| Hard filters | Budget + place type only (when answered) |
| Soft ranks | Term preference + figures comfort |
| Place “any” | **Removed** — Skip = no place constraint |
| Term parse | Midpoint of ranged `leaseLabel`; single year as-is; unparseable = no term score |
| Skip behavior | Clears that step’s answer and advances |
| Results | ≤3 cards + why under each + browse-all + “Change answers” |
| Visual bar | Polished public-brand surface (cream/paper/green, intentional motion) |

## Out of scope

- Auth / saved preferences / schema
- Advisory or suitability language
- Live “match count” sidebar while answering
- Rewriting catalogue filter IA
- Admin-configurable questions
- Email capture / CRM hooks
- Forking a second asset-card component system

## Experience (UX/UI)

### Stage model

1. **Question stages (1–4):** One composition — quiet chrome, progress indicator,
   one headline question, one short supporting sentence, large choice controls,
   Skip + Back + Continue.
   - Continue enabled only when a choice is selected.
   - **Skip** clears that step’s answer and advances.
   - Back returns to the previous step (answers retained).
2. **Results stage:** Headline e.g. “Based on what you explored”; up to three
   opportunity cards; **why** as one muted line under each card’s title/meta;
   per-card link to detail; “Browse all opportunities”; **Change answers**
   (back to step 1 with state kept); persistent disclaimer.
3. **Empty stage:** Honest copy + catalogue CTA when nothing qualifies after
   relax rules.
4. **Relaxed banner:** If place type was dropped to find matches, show one status
   line above results (e.g. “No opportunities matched that place type — showing matches
   across types for your budget.”).

### Visual & motion (implementation bar)

- Public tokens: cream canvas, paper surfaces, green accents, display type for
  questions (same family as marketing).
- Not a dashboard, not a dense form card, not purple/AI-default chrome.
- Question optically centered in the first viewport; generous vertical rhythm.
- Choices: single column on mobile; up to 2×2 on desktop when still calm.
- Progress visible but light (e.g. “Step 2 of 4” + subtle dots) — not a heavy
  multi-step checkout chrome.
- Soft step transitions (cross-fade or short slide); honor
  `prefers-reduced-motion: reduce` (instant swap, no motion).
- Results feel like a deliberate ending screen, not an afterthought list.
- Mobile: ≥44px targets; stacked results.

### Accessibility

- On step change, move focus to the question heading (or first choice).
- Choices are buttons or radiogroup semantics, not clickable divs only.
- Progress is textually available (e.g. “Step 2 of 4”).
- Disclaimer always visible (not toast-only).

## Questions

| # | Theme | Options | Constraint type |
|---|--------|---------|-----------------|
| 1 | Budget | under €10k / €10–25k / over €25k | Hard — exact catalogue bands via `matchesMinBand` + `catalogueMinBasis` (`under10` is `< 10000`) |
| 2 | Place type | airport / station / city / retail | Hard — `normalizeSiteType` (Skip = no place filter) |
| 3 | Term preference | prefer ≤11y / ~12y / ≥13y | Soft — midpoint parse of `leaseLabel` |
| 4 | Figures comfort | simpler parking-led figures / happy to see mixed or modelled figures | Soft — mix complexity / modelled provenance — **not** a risk rating |

Skip on any step = no constraint for that dimension (and clears any prior choice on that step).

### Copy principles

- Questions invite exploration (“What budget feels comfortable to explore?”).
- Forbidden: “best for you”, “recommended for you”, “suitable”, “should invest”,
  “lower risk”, “safer”.
- Figures step labels describe **illustration style / mix complexity**, never safety.
- Why lines: factual only, e.g. “Minimum fits your €10–25k band · Station”.

### Disclaimer

- Shared illustrative line (same substance as guides; avoid awkward “This guide…”
  on a tool). Prefer a dedicated constant such as
  `CHOOSER_ILLUSTRATIVE_DISCLAIMER` in `lib/copy/consumer.ts`, e.g.
  “This tool is illustrative and not a live investment offering. Figures are
  examples only. Capital at risk.” (no apostrophes — same HTML assertion pattern).
- Plus one line: matches are preference filters for browsing, not personal
  recommendations.

## Matching algorithm

Pure module (e.g. `lib/assets/help-me-choose.ts`), vitest-covered.

**Input:** published asset list fields + answer object (each field nullable/skipped).  
**Output:** `{ results: { asset, reasons: string[] }[]; relaxedPlace: boolean }`.

1. Start from published assets whose opportunity status is **`open`**
   (same default as `/opportunities` funding filter).
2. Apply hard filters for budget and place when set.
3. If zero remain and place was set, **clear place filter once**; set
   `relaxedPlace: true`.
4. If still zero → empty results.
5. Else soft-score term + figures comfort; stable sort by score then name.
6. Take top **3**.
7. Build `reasons` only from constraints that actually contributed
   (include a note in UI when `relaxedPlace`, not necessarily per-card).

### Soft scoring (locked)

- **Term:** Parse years from `leaseLabel`. Single number → that year. Range
  `A–B years` / `A-B years` → **midpoint** `(A+B)/2`. Unparseable → no term points.
  Prefer band match +2; adjacent band +1.
- **Figures:** `simpler` boosts vehicle-parking-dominant mixes and
  contracted/withheld-leaning presentation; `mixed` boosts multi-stream /
  modelled provenance. Boosts are small; **never** hard-filter out.

### All skipped

Return three starter opportunities in stable **name ascending** order with reason
“No preferences set — a place to start browsing.”

## Page & entry

- **Route:** `app/help-me-choose/page.tsx` (+ client wizard component).
- **Metadata:** title/description with non-advisory framing; add path to
  `app/sitemap.ts`.
- **Data:** Server loads published assets once; derive open pool; client runs
  matcher on results (or whenever advancing to results).
- **Entry points:**
  - Homepage: **ghost or text link** near Explore — must not compete with the
    primary Explore CTA.
  - Opportunities intro: “Help me choose” text/link-arrow.
  - Primary nav: optional — not required v1.
- **Cards:** Compose existing `AssetCard` (or equivalent catalogue card) inside a
  wrapper that adds the why line — do not fork a parallel card component.

## Implementation notes

- Reuse `catalogueMinBasis`, `matchesMinBand`, `normalizeSiteType`,
  `buildOpportunityPresentation` / status helpers.
- Prefer CSS in `globals.css` under a `help-me-choose` block using existing tokens.
- No server action required for matching; client state is enough.
- URL query sync for shareable results is nice-to-have, not required v1.

## Testing

- Unit: matcher hard/soft/relax/empty/all-skipped/why-lines; open-only pool;
  term midpoint; skip clears answer; copy constants free of suitability vocabulary
  and apostrophes where asserted.
- Component: step progress, skip/back/continue, results + change-answers,
  relaxed banner (static markup or RTL).
- Manual: desktop + ~390px full path; reduced motion; homepage entry doesn’t
  overpower Explore.
- `tsc` + vitest green.

## Success criteria

1. Visitor can complete or skip through four calm stages and see ≤3 explained matches.
2. Copy never claims personal recommendation, suitability, or risk advice.
3. Matching uses open catalogue pool; term/figures soft; budget/place hard with one place relax + honest banner.
4. Visual language matches public Parkwise; results are a deliberate ending screen.
5. Sitemap + metadata present; CI stays green.
