// Kamil Postaağası, 2023501030

/** What the middlewares leave in the Hono context for the routes. */
export type Env = {
  Variables: {
    requestId: string; // set by the logging middleware for every request
    userId: number; // set by requireAuth on /api routes
  };
};

/** One structured log line. */
export type LogLine = Record<string, unknown>;
export type Logger = (line: LogLine) => void;
