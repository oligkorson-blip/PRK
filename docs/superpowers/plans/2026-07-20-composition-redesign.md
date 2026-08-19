# Composition Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign important Parkwise compositions (home, catalogue, detail, portal) with selective visual refresh while keeping brand tokens and compliance CTAs.

**Architecture:** Spec-driven section cuts + CSS hero atmosphere + catalogue/detail/portal structure edits. No new design-system package.

**Tech Stack:** Next.js App Router, `globals.css`, existing `AssetCard` / portal shell / marketing-art.

**Status:** Implemented on `main` (commits through `ef384cc`); residual compliance polish on apply + home closing `RISK_LINE` continued 2026-07-20.

## Global Constraints

- Primary CTA remains View opportunities → `/opportunities`
- Capital at risk / RISK_LINE near CTAs; status-bar kept on home
- Apply-first for guests; no fake testimonials/AUM
- Hero budget: brand + headline + support + CTA group + atmosphere — no asset card in hero
- Atmosphere = branded CSS/SVG (no photo dependency)
- Keep forest/cream/coral tokens

---

### Task 1: Home redesign

- [x] Rewrite `app/page.tsx` to exact 6-section map; delete listed sections
- [x] Hero: brand signal + campaign copy + CTAs + RISK_LINE; remove featured card
- [x] Add full-bleed branded atmosphere CSS (+ optional marketing-art)
- [x] Live opportunities rail: 3 cards + View all
- [x] Add 2–3 motions with reduced-motion respect
- [x] Commit

### Task 2: Catalogue browse-first

- [x] Move filters/grid above tier primer
- [x] Demote tier primer (details or below)
- [x] Default open-first emphasis
- [x] Commit

### Task 3: Detail jump nav + spine

- [x] Reduce DETAIL_NAV to overview/returns/fees/risks/documents
- [x] Fold location/revenue/management into overview (keep content)
- [x] Clarify signed-out apply CTA copy; preserve gates
- [x] Commit

### Task 4: Portal empty vs active

- [x] Empty: timeline + next action first; suppress empty KPI wallpaper
- [x] Active: keep compact KPIs + holdings
- [x] Commit

### Task 5: Polish story + apply

- [x] Lighten how-it-works / why-parking / about card density + CTA spam
- [x] Apply trust framing polish
- [x] Commit

### Task 6: Verify + Docker rebuild

- [x] Unit tests green (145)
- [x] Smoke key routes via Playwright + local postgres (`npm run dev`); full Docker web image rebuild blocked (registry timeout)
