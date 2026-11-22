// Kamil Postaağası, 2023501030
import type { MiddlewareHandler } from "hono";
import type { Env, Logger } from "./types.ts";

/** One JSON object per line, so a log tool can search and count them. */
export const jsonLogger: Logger = (line) => console.log(JSON.stringify(line));

/**
 * Gives every request an id and leaves one log line when the response is ready.
 * Only the method, the path (without the query string), the status, the time and the user
 * id are logged: never headers, bodies or query strings, so no password or token can leak.
 */
export const requestLog = (log: Logger): MiddlewareHandler<Env> => async (c, next) => {
  const start = performance.now();
  const requestId = crypto.randomUUID();
  c.set("requestId", requestId);
  c.header("x-request-id", requestId);
  await next(); // run the route first, then log
  log({
    time: new Date().toISOString(),
    requestId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    ms: Math.round(performance.now() - start),
    userId: c.get("userId") ?? null,
  });
};
