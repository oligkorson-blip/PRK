# Plan 3 verification

Branch: `feature/platform-plan3` (re-verify on one-server hosting)

- [x] `npm test` passes (unit tests including storage key, document access, portfolio summary)
- [x] `npm run build` passes
- [x] `/api/health` still expected to return ok when app runs
- [x] Document access rules covered by unit tests
- [ ] Admin document upload (requires `DOCUMENTS_DIR` + admin session)
- [ ] Investor document download (requires local vault files + auth)
- [x] Holdings page shows contractual income summary + risk disclaimer (code)
- [ ] Admin asset status toggle (requires admin session + `DATABASE_URL`)
- [x] Unique-violation on pending interest returns friendly error (code path)
- [x] Admin confirm/decline emails wrapped in try/catch (code; Resend not used — skip-log)
- [x] Production checklist written (`docs/PRODUCTION_CHECKLIST.md`)

## Unblock live items

1. Fill `.env.local` per `docs/SETUP.md` (`DATABASE_URL`, Better Auth vars, `DOCUMENTS_DIR`).
2. `npm run db:migrate && npm run db:seed`
3. `npm run dev` and exercise upload / download / asset status.
