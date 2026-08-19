# Apply-first UX verify — P0 HTML harvest

Manual checklist after marketing visual harvest (schematic cards, simulator, hero, About/Why SVGs, portal-card sign-in, apply chrome).

## Breakpoints

Check at ~360px, ~768px, and ~1280px width.

| Surface | What to confirm |
|---|---|
| `/` | Hero grid shows illustration + funding card; no horizontal scroll; funding card stacks under art on narrow |
| `/opportunities` | Each card has bay schematic; filters wrap without overflow |
| `/how-it-works` | Simulator ranges + Standard/Premium/EV tiers; disclaimer visible; CTA → `/apply` |
| `/about` | City-map split SVG; CTA band art (hidden ≤720px) |
| `/why-parking` | EV canopy split SVG; CTA → `/apply` |
| `/sign-in` | Portal-card chrome; Apply secondary link |
| `/apply` | Form-card + step indicator; form grid single-column on mobile |
| Header | Mobile menu opens without page overflow |

## Risk / compliance copy

- Simulator disclaimer: contractual target, not forecast/guarantee, capital at risk
- No “Green” yield label (use EV)
- CTAs request access / apply, not open signup

## Automated

```bash
cd apps/web && npm test && npx tsc --noEmit
```
