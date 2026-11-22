// Kamil Postaağası, 2023501030
import { OpenAPIHono, type z } from "@hono/zod-openapi";
import { fail, toIssues } from "./errors.ts";
import { ErrorSchema } from "./validation.ts";
import type { Env } from "./types.ts";

/**
 * Every router of the app is an OpenAPIHono with this hook: when a request fails its Zod
 * schema, the answer is our one error shape, not the library's default.
 */
export const router = () =>
  new OpenAPIHono<Env>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return fail(c, 400, "validation failed", toIssues(result.error.issues));
      }
    },
  });

/** A JSON response entry for createRoute. */
export const json = <T extends z.ZodType>(schema: T, description: string) => ({
  content: { "application/json": { schema } },
  description,
});

/** The error responses, so the docs show failures as well as successes. */
export const errors = {
  400: json(ErrorSchema, "Bad input: the issues say which field and why"),
  401: json(ErrorSchema, "Missing, unknown or expired token"),
  403: json(ErrorSchema, "Logged in, but the role is not allowed"),
  404: json(ErrorSchema, "Not found (or not yours)"),
  409: json(ErrorSchema, "Conflict"),
  413: json(ErrorSchema, "File too large"),
  415: json(ErrorSchema, "File type not allowed"),
  429: json(ErrorSchema, "Too many failed logins"),
  503: json(ErrorSchema, "Not ready"),
} as const;

/** The body of a POST or PUT. required: a missing body is a 400, not an empty object. */
export const body = <T extends z.ZodType>(schema: T) => ({
  body: { content: { "application/json": { schema } }, required: true },
});

export const bearer = [{ Bearer: [] }];
