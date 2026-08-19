# Parkwise UI Polish Design

> **Superseded (2026-07-19):** This document targeted the static `css/style.css` / `js/main.js` site. The live product is the Next.js app under `apps/web`. See `2026-07-19-full-platform-ux-program-design.md` and the admin redesign `2026-07-18-admin-console-redesign-design.md` for current UX work. Polish *intent* (mobile CTAs, sticky header, reduced-motion, viewport matrix) is carried forward there.

## Goal

Improve the visual quality, responsiveness, and usability of the existing Parkwise website without changing its brand, content, page structure, or functional flows.

## Scope

The polish applies to all existing marketing, registration, portal, and dashboard pages. Existing copy, catalogue data, illustrations, URLs, and JavaScript behavior remain intact unless a small interaction adjustment is required for accessibility or responsive behavior.

## Visual System

- Keep the green, cream, lime, mint, and orange palette.
- Keep Archivo, Inter, and Fraunces typography.
- Tighten the spacing scale so related content feels grouped and long pages scan faster.
- Use quieter, more consistent shadows and borders to improve depth without making cards feel detached.
- Standardize hover, active, focus, and disabled states across links, buttons, cards, and controls.
- Preserve the current rounded visual language while reducing inconsistent radius and padding combinations.

## Header and Navigation

- Preserve the current top bar, logo, links, and actions.
- Improve desktop alignment and active-page indication.
- On mobile, expose both primary navigation and investor actions in the expanded menu.
- Animate the menu icon state, add `aria-expanded`, and support closing via Escape and outside interaction where practical.
- Ensure the sticky header does not obscure focused or anchored content.

## Marketing Pages

- Preserve section order and text.
- Refine hero proportions so the heading, illustration, funding card, and calls to action have clearer hierarchy.
- Reduce oversized vertical gaps while retaining a premium, spacious appearance.
- Align repeated card patterns and normalize card heights, internal spacing, metadata, and actions.
- Improve the opportunity matcher and filters on small screens with clearer grouping and full-width controls.
- Make decorative effects less visually dominant than investment facts and primary actions.

## Forms and Portal

- Preserve all fields and validation logic.
- Improve label, input, helper, error, and focus-state consistency.
- Increase mobile tap targets and make multi-step controls easier to scan.
- Improve form grouping and action placement without changing the registration steps.
- Keep the demo portal behavior while making the demo-access message visually secondary.

## Dashboard

- Preserve all metrics, charts, holdings, and payouts.
- Improve density and hierarchy so key portfolio figures are visible first.
- Normalize panel spacing and responsive stacking.
- Ensure tables and data-rich rows remain usable on narrow screens without clipped information.

## Accessibility and Motion

- Maintain visible keyboard focus on all interactive elements.
- Add or correct state attributes for navigation, accordions, and modals.
- Ensure interactive cards have clear keyboard and hover affordances.
- Respect reduced-motion preferences for transitions, animations, and smooth scrolling.
- Preserve readable contrast and avoid using color as the only state indicator.

## Responsive Behavior

- Retain the existing breakpoints unless a component needs a more suitable local breakpoint.
- Prioritize layouts at approximately 360px, 768px, 1024px, and 1440px widths.
- Avoid horizontal overflow and ensure controls remain at least 44px high where practical.
- Keep primary calls to action visible and easy to reach on mobile.

## Technical Approach

- Make most changes in `css/style.css`.
- Apply small shared behavior and accessibility updates in `js/main.js`.
- Change HTML only where semantic attributes or mobile navigation actions are missing.
- Avoid new dependencies, frameworks, build tools, or generated assets.

## Verification

- Review all pages at desktop and mobile widths.
- Exercise navigation, accordions, opportunity interactions, registration steps, portal login, modals, and dashboard layouts.
- Check keyboard navigation and reduced-motion behavior.
- Confirm that all existing links, content, and demo flows remain functional.

## Non-Goals

- Rebranding or replacing the existing visual identity.
- Rewriting marketing copy or changing information architecture.
- Adding backend services, authentication, analytics, or new investor workflows.
- Replacing the static HTML/CSS/JavaScript architecture.
