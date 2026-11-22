// Kamil Postaağası, 2023501030
import type { Role } from "./schema.ts";
import type { Conn } from "./db.ts";

/** What the middlewares leave in the Hono context for the routes. */
export type Env = {
  Variables: {
    requestId: string; // set by the logging middleware for every request
    userId: number; // set by requireAuth on /api routes
    role: Role; // set by requireAuth next to userId (Bonus 9)
    conn: Conn; // the pooled connection this request borrowed (Bonus 6)
  };
};

/** One structured log line. */
export type LogLine = Record<string, unknown>;
export type Logger = (line: LogLine) => void;
