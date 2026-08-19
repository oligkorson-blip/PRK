/**
 * Real-Postgres harness for the integration suite.
 *
 * Each test file gets its own scratch database (`parkwise_it_*`), created on
 * the server pointed at by PARKWISE_TEST_DATABASE_URL (preferred) or
 * DATABASE_URL (CI fallback, where the service container is the only server).
 * The app's `db` proxy (lib/db/client.ts) resolves DATABASE_URL lazily on
 * first query, so pointing DATABASE_URL at the scratch database in beforeAll
 * — before any action runs — routes the modules under test at the scratch DB.
 *
 * When neither env var is set the whole suite skips cleanly (exit 0).
 * When a URL is set but the server is unreachable, beforeAll throws and the
 * run fails loudly — that is a misconfiguration, not an absent database.
 *
 * Leftover databases from crashed runs are safe to drop:
 *   SELECT datname FROM pg_database WHERE datname LIKE 'parkwise_it_%';
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { describe } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));

export const TEST_DATABASE_URL =
  process.env.PARKWISE_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

export const DATABASE_AVAILABLE = Boolean(TEST_DATABASE_URL);

/** Suite-level gate: skips every test in the file when no server is configured. */
export const describeIntegration = describe.skipIf(!DATABASE_AVAILABLE);

export type IntegrationDbHandle = {
  /** Scratch database name (also embedded in `url`). */
  database: string;
  /** Connection URL the app under test is using. */
  url: string;
  /** Drops the scratch database; call in afterAll. */
  teardown: () => Promise<void>;
};

export async function setupIntegrationDatabase(): Promise<IntegrationDbHandle> {
  if (!TEST_DATABASE_URL) {
    throw new Error("PARKWISE_TEST_DATABASE_URL/DATABASE_URL is not set");
  }

  // Never send real email from tests, even on a developer machine with SMTP set.
  delete process.env.SMTP_HOST;

  const database = `parkwise_it_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = postgres(TEST_DATABASE_URL, { max: 1 });
  // Identifiers are generated above (pid + base36 random): safe to interpolate.
  await admin.unsafe(`CREATE DATABASE ${database}`);

  const scratch = new URL(TEST_DATABASE_URL);
  scratch.pathname = `/${database}`;
  const url = scratch.toString();

  // Must happen before the first query through the app's lazy db proxy.
  process.env.DATABASE_URL = url;

  const migrator = drizzle(postgres(url, { max: 1 }));
  await migrate(migrator, {
    migrationsFolder: path.resolve(here, "../../../drizzle")
  });

  return {
    database,
    url,
    teardown: async () => {
      await migrator.$client.end({ timeout: 5 }).catch(() => {});
      // FORCE: the app's cached connection pool (lib/db/client.ts) still holds
      // sessions against this database; PG13+ drops it anyway.
      await admin.unsafe(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
      await admin.end({ timeout: 5 }).catch(() => {});
    }
  };
}
