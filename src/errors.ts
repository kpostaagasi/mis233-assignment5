// Kamil Postaağası, 2023501030
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod";

/** One entry of the "issues" list: where the problem is and what it is. */
export type Issue = { path: (string | number)[]; message: string };

/** The one error shape of this API: { error, issues? }. */
export type ErrorBody = { error: string; issues?: Issue[] };

/** Zod issues carry more fields than a client needs; keep the path and the message. */
export function toIssues(issues: z.core.$ZodIssue[]): Issue[] {
  return issues.map((i) => ({
    path: i.path.filter((p): p is string | number => typeof p !== "symbol"),
    message: i.message,
  }));
}

/** Every failure in the app goes through here, so they all look the same. */
export function fail(
  c: Context,
  status: ContentfulStatusCode,
  error: string,
  issues?: Issue[],
) {
  const body: ErrorBody = issues ? { error, issues } : { error };
  return c.json(body, status);
}
