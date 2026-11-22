// Kamil Postaağası, 2023501030
import { fromFileUrl } from "@std/path";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate as runMigrations } from "drizzle-orm/libsql/migrator";
import { type Client, createClient } from "@libsql/client";
import type { MiddlewareHandler } from "hono";
import * as schema from "./schema.ts";
import type { Env } from "./types.ts";
import { Pool } from "./pool.ts";

/** One connection: the libSQL client and the Drizzle object built on it. */
export type Conn = { db: LibSQLDatabase<typeof schema>; client: Client };

/** The main connection (start-up, jobs, scripts) plus a pool for the requests. */
export type Db = Conn & { pool: Pool<Conn>; all: Conn[]; url: string };

/** The SQL files that Drizzle Kit generated from schema.ts (deno task db:generate). */
export const MIGRATIONS = fromFileUrl(new URL("../drizzle", import.meta.url));

function connect(url: string, authToken?: string): Conn {
  const client = createClient({ url, authToken });
  return { client, db: drizzle(client, { schema }) };
}

/**
 * Open a database. Tests pass a temporary file; Deno Deploy passes a Turso URL + token.
 * poolSize connections are opened on the same database for the request pool (Bonus 6).
 */
export function createDb(url: string, authToken?: string, poolSize = 4): Db {
  const main = connect(url, authToken);
  const conns = Array.from({ length: poolSize }, () => connect(url, authToken));
  return { ...main, pool: new Pool(conns), all: [main, ...conns], url };
}

/**
 * Bring the database up to date. Drizzle records the applied files in the table
 * __drizzle_migrations, so each file runs once, in order, and a second call does nothing.
 * For a local file it also sets the two settings that let several connections share it.
 */
export async function migrate(db: Db) {
  if (db.url.startsWith("file:")) {
    // WAL: readers do not block the writer, and it is stored in the file itself.
    // busy_timeout: wait up to 5 s for a lock instead of failing at once with SQLITE_BUSY;
    // it is a per-connection setting, so every client gets it.
    await db.client.execute("PRAGMA journal_mode=WAL");
    for (const conn of db.all) await conn.client.execute("PRAGMA busy_timeout=5000");
  }
  await runMigrations(db.db, { migrationsFolder: MIGRATIONS });
}

/** Close every connection (tests and scripts). */
export function closeDb(db: Db) {
  for (const conn of db.all) conn.client.close();
}

/**
 * Bonus 6: each request borrows one connection for its whole life and gives it back in
 * a finally, even when the route throws. When all are busy, the request waits in the queue.
 */
export const withConnection = (pool: Pool<Conn>): MiddlewareHandler<Env> => (c, next) =>
  pool.use(async (conn) => {
    c.set("conn", conn);
    await next();
  });
