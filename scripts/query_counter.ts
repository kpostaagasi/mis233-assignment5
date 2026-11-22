// Kamil Postaağası, 2023501030
import { drizzle } from "drizzle-orm/libsql";
import type { Logger } from "drizzle-orm/logger";
import type { Client } from "@libsql/client";
import * as schema from "../src/schema.ts";

/** A Drizzle logger that remembers every SQL statement, so we can count them. */
export class QueryCounter implements Logger {
  queries: string[] = [];
  constructor(private print = false) {}
  logQuery(query: string, params: unknown[]) {
    this.queries.push(query);
    if (this.print) console.log(`  Query: ${query} -- params: ${JSON.stringify(params)}`);
  }
}

/** A second Drizzle object on the same client, with the counting logger switched on. */
export function countingDb(client: Client, print = false) {
  const counter = new QueryCounter(print);
  return { db: drizzle(client, { schema, logger: counter }), counter };
}
