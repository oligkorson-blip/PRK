# Agency marketing copy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved warm-professional agency copy deck across marketing surfaces, updating campaign headline, CTAs, and home structure while keeping forest/cream brand tokens and Manrope + Fraunces.

**Architecture:** Centralize strings in `lib/copy/consumer.ts` (+ journey/access step sources). Rewire home to the agency section map. Flip signed-out primary chrome to “Request access” → `/apply`. Update e2e smoke, OG, and contract tests in the same pass as the headline change.

**Tech Stack:** Next.js 15 App Router, vitest, Playwright smoke (`apps/web/e2e`).

## Global Constraints

- Product locks from the agency spec remain: invite-only, apply-first, Hybrid C / capital at risk, no UK/NL/PL catalogue claims, EV not “Green”, no UCITS/AIF/crowdfunding claims, no fake testimonials/stars.
- **Typography:** keep **Manrope + Fraunces** (live). Spec’s “Archivo” is superseded by the shipped design system.
- **Composition close-out stays:** SVG/CSS hero atmosphere (no photo dependency); status-bar; detail jump ≤5; `termsSeen`; apply `?asset=&option=`. Agency **funding card** sits in the hero visual column as branded panel content (not a DB asset card).
- Do not invent regulated-fund or guaranteed-yield language.
- Prefer “Request access” over “Sign up” / “Get started” / “Apply for access” on marketing chrome (lexicon). Portal/admin can keep existing operational labels unless a task says otherwise.
- Node 22 via nvm; run JS from `apps/web`.

---

## File map

| File | Role |
|------|------|
| `apps/web/lib/copy/consumer.ts` | Campaign headline/support, risk lines, status bar, home section copy constants |
| `apps/web/lib/copy/access-steps.ts` (create) | Home “How access works” 3-step deck |
| `apps/web/lib/copy/journey-steps.ts` | HIW 4-step process (agency 4.2) |
| `apps/web/lib/copy/cta.ts` | Header + detail CTA labels/hrefs → Request access |
| `apps/web/app/page.tsx` | Agency home section map |
| `apps/web/app/how-it-works/page.tsx` | Agency HIW intro + steps |
| `apps/web/app/why-parking/page.tsx` | Calm institutional deck |
| `apps/web/app/about/page.tsx` | Agency about |
| `apps/web/app/apply/page.tsx` | Request access framing |
| `apps/web/app/(auth)/sign-in/page.tsx` | Sign-in lead + foot |
| `apps/web/app/documents/page.tsx` | Documents H1/lead/CTAs |
| `apps/web/app/opportunities/page.tsx` | Catalogue intro copy |
| `apps/web/app/portal/**` empty states | Portal empty copy (Phase 1) |
| `apps/web/app/opengraph-image.tsx` + layout metadata | Headline sync |
| `apps/web/e2e/smoke.spec.ts` | New H1 + CTA assertions |
| `apps/web/tests/*` | Contract tests for copy + home structure |

---

### Task 1: Copy sources + CTA lexicon

**Files:**
- Modify: `apps/web/lib/copy/consumer.ts`
- Create: `apps/web/lib/copy/access-steps.ts`
- Modify: `apps/web/lib/copy/journey-steps.ts`
- Modify: `apps/web/lib/copy/cta.ts`
- Modify: `apps/web/lib/copy/cta.test.ts`
- Modify: `apps/web/lib/copy/consumer.test.ts` (if present)

- [ ] **Step 1:** Set `CAMPAIGN_HEADLINE` to `Parking infrastructure for European cities.` and `CAMPAIGN_SUPPORT` to the agency home lead. Add `STATUS_BAR_HOME` / risk lines aligned with “contractual targets” where the deck specifies. Export home section strings (What Parkwise is, FAQ Q&As, closing CTA).
- [ ] **Step 2:** Add `ACCESS_STEPS` (3 rows from agency §4.1 How access works). Rewrite `JOURNEY_STEPS` to agency §4.2 (4 process steps).
- [ ] **Step 3:** Change marketing CTA labels to **Request access** (`/apply`). `resolveHeaderCta` default and catalogue CTA → Request access. Keep detail signed-out CTA label Request access (already deep-links).
- [ ] **Step 4:** Update/extend vitest for headline, `buildApplyHref`, header CTA.
- [ ] **Step 5:** Commit `feat(copy): lock agency campaign strings and Request access CTAs`

---

### Task 2: Home page agency structure

**Files:**
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/globals.css` (only if FAQ / “what we are” need small layout helpers)
- Modify: `apps/web/tests/marketing-catalogue-polish.test.ts`, `tests/composition-closeout.test.ts`

**Home section order (locked):**
1. Status bar  
2. Hero — brand, kicker optional, H1 from `CAMPAIGN_HEADLINE`, lead, primary **Request access**, secondary **View opportunities**, risk line; visual = SVG atmosphere **or** static funding panel (Published catalogue / Focus markets / Continental parking hubs + footnotes)  
3. What Parkwise is  
4. How access works (`ACCESS_STEPS`)  
5. Featured hubs (3 cards)  
6. Why parking strip  
7. FAQ  
8. Closing CTA (Request access + View opportunities)

Keep JsonLd, `RISK_LINE` near CTAs, ≥3 opportunity links when assets exist.

- [ ] **Step 1:** Failing contract test asserting new H1 source + Request access primary + FAQ section id present + no `hero-main.jpg`.
- [ ] **Step 2:** Implement `page.tsx` section map.
- [ ] **Step 3:** Vitest pass; smoke headline assertion updated in Task 4.
- [ ] **Step 4:** Commit `feat(home): ship agency home copy and section map`

---

### Task 3: Marketing pages + portal empties (Phase 1 remainder)

**Files:**
- Modify: `how-it-works`, `why-parking`, `about`, `apply`, `documents`, `opportunities` pages
- Modify: sign-in page foot/lead
- Modify: portal empty-state strings (overview / interests / holdings / kyc as applicable)

- [ ] **Step 1:** Apply PageIntro titles/leads from agency §§4.2–4.5, 4.7–4.9.
- [ ] **Step 2:** Portal empty copy table §4.10.
- [ ] **Step 3:** Vitest smoke on key strings (or page contract tests).
- [ ] **Step 4:** Commit `feat(marketing): apply agency copy to HIW, about, apply, documents, portal empties`

---

### Task 4: Smoke, OG, verification

**Files:**
- Modify: `apps/web/e2e/smoke.spec.ts`
- Modify: `apps/web/app/opengraph-image.tsx`, `apps/web/app/layout.tsx` metadata
- Modify: any remaining “They park” assertions in tests

- [ ] **Step 1:** Update smoke H1 regex to agency headline; allow Request access as primary where asserted.
- [ ] **Step 2:** Sync OG/twitter descriptions.
- [ ] **Step 3:** `npx vitest run` (relevant + copy suites) and `npx tsc --noEmit`.
- [ ] **Step 4:** Commit `test: align smoke and OG with agency campaign headline`

---

### Task 5 (later / out of this PR if time-boxed): Phase 2–4

- Apply wizard field labels, opportunity gated CTAs polish, guides calm-institutional voice.
- Do not block Phase 1 ship on Phase 2–4.

---

## Done when

- Home matches agency section intent with Request access primary and new H1.
- Consumer copy constants are the single source for campaign headline.
- Smoke + vitest + tsc green.
- Spec status note: agency redesign **Approved 2026-07-26**; composition atmosphere + status-bar retained.
