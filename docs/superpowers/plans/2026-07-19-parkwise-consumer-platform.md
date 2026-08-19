# Parkwise Consumer Platform Redesign — Implementation Plan

> **Date:** 2026-07-19  
> **Status:** Complete (Passes 1–19) — uncommitted on `feat/consumer-platform` pending explicit commit/PR  
> **Source brief:** Consumer investment platform reposition (campaign headline + monthly income potential)

## Audit (existing)

| Area | Finding |
|------|---------|
| Positioning | Invite-only deal room; institutional jargon |
| Hero | “Own the spaces cities can’t function without” — infrastructure, not income |
| CTA | Request access dominant everywhere |
| Language | Deal room, allocation, holding record, contractual target |
| Calculator | Exists but buried on How it works; weak disclaimer |
| Cards | Abstract art; thin comparison data; no payment schedule |
| Trust | Perimeter/posture heavy; little consumer benefit framing |
| IA | Missing dedicated FAQ, Fees, Contact pages |
| Visual | Strong green/cream/lime/orange identity; keep and refine |

## Product honesty (non-negotiable in implementation)

- Campaign “make money every month” always paired with qualifier + risk line
- Target / illustrative / potential — never guaranteed
- No fabricated AUM, testimonials, or funding % without data (use “Open” status)
- Backend invite/apply flow can remain; surface language becomes consumer (“Create account” / “View opportunities”)

## Sitemap (target)

Home · Opportunities · Opportunity detail · How it works · Why parking · Guides · Guide article · About · FAQ · Apply/Create account · Sign in · Portal (dashboard) · Documents · Contact · Risk · Fees · Terms · Privacy · Cookies · Complaints

## Journey

Browse opportunities → Understand model (home/how it works) → Review opportunity → Create account / apply → KYC → Invest → Track in dashboard

## Execution order

1. Tokens, fonts, consumer copy module, posture soft rewrite  
2. Header / footer / CTAs  
3. Home (full section stack + calculator)  
4. Asset cards + opportunities  
5. How it works / why parking / about / FAQ / fees / contact  
6. Apply + portal consumer labels  
7. Guides polish + SEO metadata  
8. QA / a11y / typecheck

## Progress log

- **Pass 1:** Home, nav, calculator, core marketing pages, consumer lexicon
- **Pass 2:** Opportunity detail (11 sections), catalogue filters/sort, new guides, dashboard KPIs
- **Pass 3:** Documents/sign-in/onboarding/interests/KYC consumer copy, legal intros, skip link + focus styles, commercial term labels softened, opportunities SEO + empty states
- **Pass 4:** Asset visual gallery (aerial/street/hub scenes), `/portal/holdings/[id]` investment detail, payment history scaffold (honest empty), fees guide
- **Pass 5:** Real funding % from holdings vs `advisoryCapacityEur`, `distributions` ledger + migration, portal income received wired to ledger, funding filters
- **Pass 6:** Admin `/admin/distributions` to record payments, nav + ops hub card, distribution helper tests
- **Pass 7:** Distribution email notify, asset `coverImageUrl`/`galleryImageUrls` + admin image form, media component, contrast tweak, placeholder SVG
- **Pass 8:** Optional SMTP via nodemailer (`SMTP_*` env), seed placeholder covers, email unit tests, SETUP runbook update
- **Pass 9:** Consumer lexicon sweep (portal timeline, interest email, catalogue/guides), older guide metadata + copy polish, sort option cleanup; plan closed
- **Pass 10:** SEO `sitemap.xml` / `robots.txt` / `metadataBase`, honest payment-schedule note (no disabled filter), funding badge “Full”, checklist yield language
- **Pass 11:** Mobile nav focus + scroll lock + `aria-controls`, funding “% funded” / “Full”, expanded Playwright marketing smoke
- **Pass 12:** FAQ in primary nav, Organization/WebSite + FAQPage JSON-LD, consumer-facing Terms intros, tighter desktop nav gap
- **Pass 13:** Privacy/cookies/risk consumer lexicon, hero + trust + card motion (respects reduced-motion)
- **Pass 14:** Consumer `not-found` + `error` pages, complaints metadata/lead, 404 smoke coverage
- **Pass 15:** Seed `advisoryCapacityEur` for funding bars, marketing loading skeletons, basic security headers
- **Pass 16:** Admin advisory capacity editor + shared capacity helpers/tests
- **Pass 17:** Brand `app/icon.svg`, opportunity detail loading skeleton, shared guides catalog for index + sitemap
- **Pass 18:** Generated Open Graph image + Apple touch icon; icons wired in root metadata
- **Pass 19:** Full Vitest green (141); per-opportunity Open Graph images
- **Pass 20:** Branch `feat/consumer-platform`; README/SETUP consumer launch notes; ignore Playwright artifacts
