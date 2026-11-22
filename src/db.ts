// Kamil Postaağası, 2023501030
import { fromFileUrl } from "@std/path";
import { drizzle } from "drizzle-orm/libsql";
import { migrate as runMigrations } from "drizzle-orm/libsql/migrator";
import { createClient } from "@libsql/client";
import * as schema from "./schema.ts";

export type Db = ReturnType<typeof createDb>;

/** The SQL files that Drizzle Kit generated from schema.ts (deno task db:generate). */
export const MIGRATIONS = fromFileUrl(new URL("../drizzle", import.meta.url));

/** Open a database. Tests pass a temporary file; Deno Deploy passes a Turso URL + token. */
export function createDb(url: string, authToken?: string) {
  const client = createClient({ url, authToken });
  const db = drizzle(client, { schema });
  return { db, client };
}

/**
 * Bring the database up to date. Drizzle records the applied files in the table
 * __drizzle_migrations, so each file runs once, in order, and a second call does nothing.
 */
export async function migrate({ db }: Db) {
  await runMigrations(db, { migrationsFolder: MIGRATIONS });
}
