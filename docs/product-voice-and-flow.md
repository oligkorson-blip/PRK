# Parkwise product voice and flow standard

This is the product-wide standard for public pages, investor portals, admin tools, contracts, email, and notifications.

## Product feeling

Parkwise should feel calm, clear, capable, and human.

Compliance should increase confidence through clarity. It should never be used as visual noise, emotional pressure, or a substitute for explanation.

## Flow pattern

Use this sequence whenever a user is making progress:

1. **Where am I?** Show the current stage and purpose of the screen.
2. **What matters here?** Lead with the few facts needed for this decision.
3. **What happens next?** Explain the next step before asking for action.
4. **What can change?** State the relevant limitation or risk beside the claim.
5. **What can I do?** Use one clear primary action and a quieter secondary action.
6. **Can I get help?** Keep support available without interrupting the main path.

Preferred status labels:

- Ready to review
- Awaiting your information
- Under review
- Awaiting your signature
- Awaiting counterparty signature
- Complete
- Needs attention
- Closed

Avoid unexplained internal labels such as pending_access, under_review, or failed.

## Copy rules

Prefer:

- “Here’s what happens next.”
- “Review the summary, then open the full agreement.”
- “Your request is non-binding.”
- “Target returns are not guaranteed.”
- “We couldn’t save that just now. Please try again.”
- “Have a question? Contact the team.”

Avoid:

- “Something went wrong.”
- “Request failed.”
- “Invalid input.”
- “You must comply.”
- “Guaranteed returns.”
- “Safe investment.”
- “Act now.”
- “Passive income.”
- “Positive returns.”

Risk wording should be specific and adjacent to the relevant decision:

> Target returns are estimates under the selected terms. You may receive less, receive it later, or receive nothing.

Do not repeat generic warnings where a specific explanation is more useful.

## Decision screens

Every decision screen should have:

- one primary button;
- a short factual summary;
- a clear next-step sentence;
- a link to supporting documents;
- relevant risk or limitation language;
- a recoverable error state;
- a visible support path.

Final legal actions should use explicit labels:

- Review and sign agreement
- Confirm and submit request
- Save investor details
- Record payment

Do not use vague final actions such as “Continue” or “Submit” when the action creates a legal or operational commitment.

## Contracts

Before the full contract, show a plain-English summary covering:

- parties and legal entity;
- investment or payment amount;
- timing;
- term and exit limitations;
- fees and costs;
- target return language;
- key conditions;
- principal risks;
- what happens after signing.

The summary must never contradict the executed document. The full agreement controls.

The portal should show contract status, document version, signature status, timestamps, and the next responsible party.

## Visual direction

Keep layouts minimal:

- one strong heading;
- short paragraphs;
- grouped information cards;
- progressive disclosure for detail;
- consistent button hierarchy;
- generous spacing;
- no competing banners;
- no dense legal copy beside a primary action.

At mobile widths, preserve the same order: context, key facts, limitation or risk, primary action, supporting detail.

## Review checklist

Before shipping a page or message, ask:

- Is the user’s current stage obvious?
- Is there one clear next action?
- Is the language human when read aloud?
- Is every positive claim qualified where necessary?
- Is the relevant risk close to the claim?
- Can a user recover from failure without losing work?
- Does the layout remain usable at phone, tablet, and desktop widths?
- Does the wording match the same status elsewhere in the product?
