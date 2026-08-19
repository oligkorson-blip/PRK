# Investor contract lifecycle

This is the shared product contract for investor and staff experiences. Legal and compliance teams should approve the final wording before implementation.

## States

| ID | Investor label | Meaning |
| --- | --- | --- |
| `ready_to_review` | Ready to review | The agreement and a plain-language summary are available. |
| `summary_viewed` | Summary viewed | The investor has opened the summary. This is informational only. |
| `agreement_viewed` | Agreement viewed | The investor has opened the full agreement. This is informational only. |
| `investor_signed` | Signed by you | The investor signature is recorded. |
| `counter_signature_pending` | Awaiting final signature | The designated legal signer still needs to complete the required counter-signature. |
| `effective` | Effective | All required signatures are complete and the agreement is in force. |
| `signed_documents_available` | Signed documents ready | Final signed copies are available to download. |
| `superseded` | Superseded | A newer agreement replaces this one. Keep the record for audit. |
| `withdrawn` | Withdrawn | The agreement is no longer available for signing. Keep the reason and audit record. |

## Transition rules

- A contract may move from `ready_to_review` through viewed states in any order.
- `investor_signed` requires a valid investor signature and the agreement version shown to the investor.
- `effective` requires every required signature; it cannot be set manually while a signature is missing.
- `signed_documents_available` follows `effective` only after final documents are stored and retrievable.
- `superseded` and `withdrawn` are terminal for signing. They remain visible with their reason.
- Every transition records actor, actor type, timestamp, contract version, and source.

## Signing and storage model

- The required signer roles are `investor` and `legal_signer`.
- The current operational path is manual: authorized super admins record each investor or Park legal-signer completion from the agreement record, with the signing date and staff audit entry.
- Provider adapters will later normalize verified signature events into the same shared signing model; the application does not depend on a provider-specific SDK.
- Provider webhook events are optional future integration work; when enabled, they are accepted only after their provider signature has been verified and are idempotent by provider event key.
- Final signed documents are retained in the existing private encrypted document vault and linked to the contract record.
- The application exposes a provider-neutral HMAC-SHA256 verifier for adapters using the conventional `sha256=<hex digest>` header; providers with another scheme must supply an equivalent verifier.
- Signed-document availability is recorded only after an active, non-retracted investor-owned document for the same investor is linked to an effective contract.
- Provider adapters publish final signed PDFs through the contract service, which validates the file, stores it in the encrypted private vault, and atomically writes the document record, audit record, and state transition; failed database work removes the stored file.

## UX requirements

- Show one clear next action for the current state.
- Present the summary before the full agreement, with direct access to both.
- Use calm, factual language. Never imply guaranteed returns or create artificial urgency.
- Make the question/contact path visible before signing.
- Keep the complete audit trail available to authorized staff. Super admins can open an agreement record from `/admin/contracts` to review current signer state, lifecycle transitions, and verified signature-event receipts.
