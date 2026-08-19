# Parkwise product lanes

## New-user lane: community parking spaces

This lane is for ordinary people who need or supply parking:

- residential and driveway spaces
- garages and private lots
- EV charging bays
- other verified spaces near useful destinations

A listing is a parking service, not an investment. The public card should lead to availability, access rules, price, and a request or booking flow.

Phase-one availability is manual by design: the team confirms the space and access details before any user is promised a booking.

The initial operating model is manual: a super admin adds a listing at `/admin/spaces`, verifies the host and space, and publishes only a general district or area. New users browse `/spaces` and request availability by email while recurring bookings and owner payouts are still pending. The catalogue has its own super-admin on/off switch and defaults on after migration.

## Converted-user lane: location-pool investments

The existing opportunity catalogue remains the investor product. It is available for browsing, but new pool requests require:

- an active converted investor account
- completed onboarding
- the super-admin pool switch to be enabled
- the existing KYC and operational review before confirmation

Turning the pool switch off blocks new requests only. It must not close, remove, or recalculate existing holdings or recorded payments.

## Card hierarchy

- Community-space card: space type, approximate location, availability, access, price, and verification state.
- Opportunity card: investment location, option, minimum, target, term, funding state, and risk.
- Holding card: confirmed investment, status, recorded payments, and documents.

Do not mix a private residential listing into the investment card system. A residential space can become part of an investable product only after its legal right, operating agreement, income model, and investor disclosures are verified.
