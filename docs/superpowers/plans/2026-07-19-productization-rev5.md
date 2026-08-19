# Productization rev 5 — Implementation Plan

> **For agentic workers:** Complete tasks in order. Spec: `docs/superpowers/specs/2026-07-19-productization-asset-legal-design.md` (rev 5).

**Goal:** Ship invite-only allocation UX: options, provenance, Hybrid C, posture, cards/detail, legal suite, 3 guides.

**Architecture:** Extend `assets` + `interests` schema; pure validators in `lib/assets/`; seed drives catalogue; client islands for options/sticky/interest ack; legal/guides as static pages.

## Tasks

1. Schema + migration (options JSON, provenance, operatorDisplay, optionId)
2. Commercial terms + option math validators + tests
3. Seed geo cut/backfill + transform
4. Asset card + catalogue copy + posture/nav lexicon
5. Detail page scroll story + OptionPicker + sticky + interest optionId/ack
6. Legal suite (terms/privacy/risk/cookies/complaints) + Hybrid C schedule
7. Guides hub + 3 articles + Cite
8. Verify vitest + tsc

## Out of scope this branch

Apply-first full wizard, SMTP, real KYC vendor, AIF, Policy B consents.
