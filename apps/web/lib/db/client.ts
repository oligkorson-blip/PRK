import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDb(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const client = postgres(databaseUrl, { max: 10 });
  return drizzle(client, { schema });
}

type Db = ReturnType<typeof createDb>;
let _db: Db | undefined;

export function getDb(): Db {
  if (!_db) _db = createDb();
  return _db;
}

export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  }
}) as Db;
