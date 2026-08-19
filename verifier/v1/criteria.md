# Acceptance criteria v1 — best-in-market design, all devices

1. **Layout integrity** — zero horizontal overflow (`scrollWidth - clientWidth === 0`)
   on every audited page. Public pages are audited at 320, 360, 390, 768, 1024,
   1440, 1920 px; the authenticated pages (opportunities, opp detail, portal,
   portal/holdings, admin, admin leads) are audited at 390 and 1440 px only.
2. **Console health** — zero page errors and zero console errors on all audited pages.
3. **Touch targets** — interactive elements ≥ 40 px effective height on all viewports
   (checkboxes measured via their enclosing label/row).
4. **Contrast** — sampled text (leads, hints, table cells, hero support copy) ≥ WCAG AA
   (4.5:1 normal, 3:1 large), measured against effective background including
   dark gradient/photo sections (palette `#0a4734` for dark hosts).
5. **Art direction** — generated brand photography present on home hero, home why section,
   CTA band, /about, /why-parking; no broken images (lazy-loaded images given time to
   fetch; images hidden via display:none on a viewport are not failures).
6. **Build health** — `tsc --noEmit` clean, `vitest` 172/172 pass, `next build` 42/42 pages.
7. **Coverage** — home, how-it-works, why-parking, fees, faq, guides, apply, contact,
   about (anonymous); opportunities, opp detail, portal, portal/holdings (investor
   persona — the catalogue is members-only); admin home, admin leads (ops persona).
