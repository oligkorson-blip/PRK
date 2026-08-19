# Integration tests (real Postgres)

The unit suite (`npm test`) mocks every drizzle call, so it never exercises
real SQL. This suite fills that gap for the most privileged mutations:

| File | Module under test |
| --- | --- |
| `staff-admin-actions.integration.test.ts` | `lib/staff/promote-actions.ts` + `transfer-actions.ts` + `demote-actions.ts` — promote / transfer / demote |
| `leads-assign-actions.integration.test.ts` | `lib/leads/assign/` — assign / remove / bulk |
| `apply-admin-actions.integration.test.ts` | `lib/apply/admin-actions.ts` — approve & invite, orphan recovery, contacted / reject |
| `interests.integration.test.ts` | `lib/interests/actions.ts` + `lib/interests/admin-actions.ts` — create / withdraw / confirm / decline |
| `portfolio-distributions.integration.test.ts` | `lib/portfolio/admin-distributions.ts` — record / scoped listings |

Everything runs against a real PostgreSQL server: drizzle migrations from
`drizzle/` are applied to a per-file scratch database, fixtures are seeded
through the app's own `db` handle, and only the session
(`@/lib/auth/session`) is mocked — so staff-context resolution, authz scoping
(`investorVisibleToStaff`, IB book checks), transactions, audit writes, and
the unique indexes / CHECK constraints from migrations 0016–0017 all run for
real.

## Running

The suite needs a Postgres server it may create/drop scratch databases on
(`parkwise_it_*`). Point `PARKWISE_TEST_DATABASE_URL` at it (falls back to
`DATABASE_URL`):

```bash
# 1. Start a throwaway server (Docker):
docker run -d --name parkwise-it -p 55432:5432 \
  -e POSTGRES_USER=parkwise -e POSTGRES_PASSWORD=it -e POSTGRES_DB=parkwise \
  postgres:16-alpine

# 2. Run the suite (script entry: test:integration)
cd apps/web
PARKWISE_TEST_DATABASE_URL=postgresql://parkwise:it@127.0.0.1:55432/parkwise \
  npx vitest run --config vitest.integration.config.ts

# 3. Throw the server away:
docker rm -f parkwise-it
```

With neither env var set, every file skips cleanly and the command exits 0 —
that is what happens on a developer machine without a database, and it is why
`npm test` never touches this directory (excluded in `vitest.config.ts`).

A configured-but-unreachable server fails loudly in `beforeAll` instead of
skipping: that surfaces CI or credential misconfiguration rather than hiding
it.

## Notes

- Files run serially (`fileParallelism: false` in
  `vitest.integration.config.ts`); each file creates and drops its own
  scratch database (`DROP DATABASE ... WITH (FORCE)`), so no manual cleanup
  is needed. Databases left behind by a killed run match `parkwise_it_%` and
  are safe to drop.
- The super admin fixture only works because the harness sets
  `SUPER_ADMIN_EMAILS` per file — mirroring production, where that env list
  is the sole authority for the role.
- The harness clears `SMTP_HOST`, so invite/notification email calls take the
  "skipped" path and never leave the machine.
- CI runs this suite in the `integration` job of
  `.github/workflows/web-ci.yml` against the postgres:16-alpine service.
