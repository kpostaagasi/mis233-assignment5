// Kamil Postaağası, 2023501030
import { createRoute, z } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { HTTPException } from "hono/http-exception";
import { sql } from "drizzle-orm";
import { type Config, testConfig } from "./config.ts";
import { type Db, withConnection } from "./db.ts";
import { jwtTokens, requireAuth, requireRole, sessionTokens } from "./auth.ts";
import { authRoutes } from "./auth_routes.ts";
import { fail } from "./errors.ts";
import { bearer, errors, json, router } from "./openapi.ts";
import { LoginLimiter } from "./rate_limit.ts";
import { jsonLogger, requestLog } from "./logging.ts";
import type { Logger } from "./types.ts";
import { taskRoutes } from "./tasks_routes.ts";
import { summary, usersOverview } from "./summary.ts";
import { SummarySchema, UserOverviewSchema } from "./validation.ts";

export type AppOptions = {
  config: Config;
  log: Logger; // where the request log lines go (tests collect them)
  welcomeTask: boolean; // Bonus 2: register also creates a first task (default true)
  limiter: LoginLimiter; // Bonus 15: tests pass one with a fake clock
};

// ------------------------------------------------------------------ route descriptions

const health = createRoute({
  method: "get",
  path: "/health",
  tags: ["system"],
  summary: "The given health check",
  responses: { 200: json(z.object({ ok: z.literal(true) }), "Up") },
});

const healthz = createRoute({
  method: "get",
  path: "/healthz",
  tags: ["system"],
  summary: "Liveness: the process answers (Bonus 11)",
  responses: {
    200: json(z.object({ ok: z.literal(true), uptimeSeconds: z.number() }), "Up"),
  },
});

const readyz = createRoute({
  method: "get",
  path: "/readyz",
  tags: ["system"],
  summary: "Readiness: the database answers SELECT 1 (Bonus 11)",
  responses: {
    200: json(z.object({ ready: z.literal(true) }), "Ready"),
    503: errors[503],
  },
});

const mySummary = createRoute({
  method: "get",
  path: "/api/me/summary",
  tags: ["tasks"],
  security: bearer,
  summary: "How many of my tasks are in each status (Bonus 3)",
  responses: { 200: json(SummarySchema, "Counts"), 401: errors[401] },
});

const adminUsers = createRoute({
  method: "get",
  path: "/api/admin/users",
  tags: ["admin"],
  security: bearer,
  summary: "Every user with a task count, admins only (Bonus 9)",
  middleware: [requireRole("admin")] as const,
  responses: {
    200: json(z.array(UserOverviewSchema), "Users"),
    401: errors[401],
    403: errors[403],
  },
});

// ------------------------------------------------------------------ the app

/** Build the whole application around a database, so tests can give it their own. */
export function createApp(db: Db, options: Partial<AppOptions> = {}) {
  const config = options.config ?? testConfig();
  const log = options.log ?? (config.APP_ENV === "test" ? () => {} : jsonLogger);
  const tokens = config.AUTH_MODE === "jwt"
    ? jwtTokens(config.JWT_SECRET)
    : sessionTokens(db);
  const limiter = options.limiter ?? new LoginLimiter();
  const startedAt = Date.now();

  const app = router();
  app.use("*", requestLog(log)); // first, so every request gets an id and a log line

  app.openapi(health, (c) => c.json({ ok: true as const }, 200));

  // Liveness: the process is up and answers. A platform restarts the app when this fails.
  app.openapi(healthz, (c) =>
    c.json({
      ok: true as const,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    }, 200));

  // Readiness: the app can do real work, so the database must answer too.
  app.openapi(readyz, async (c) => {
    try {
      await db.db.run(sql`SELECT 1`);
      return c.json({ ready: true as const }, 200);
    } catch (err) {
      console.error(err);
      return fail(c, 503, "database not ready");
    }
  });

  app.route(
    "/auth",
    authRoutes({ db, tokens, limiter, welcomeTask: options.welcomeTask ?? true }),
  );

  // Every /api route needs a token, then borrows a pooled connection (Bonus 6).
  app.use("/api/*", requireAuth(tokens));
  app.use("/api/*", withConnection(db.pool));
  app.route("/api/tasks", taskRoutes());

  // Bonus 3: counts per status in one GROUP BY query.
  app.openapi(mySummary, async (c) => {
    return c.json(await summary(c.get("conn").db, c.get("userId")), 200);
  });

  // Bonus 9 and 3: admins see every user with a task count (one LEFT JOIN, no N+1).
  app.openapi(
    adminUsers,
    async (c) => c.json(await usersOverview(c.get("conn").db), 200),
  );

  // Bonus 8: the OpenAPI document is generated from the routes above, and /docs shows it.
  app.openAPIRegistry.registerComponent("securitySchemes", "Bearer", {
    type: "http",
    scheme: "bearer",
    bearerFormat: config.AUTH_MODE === "jwt" ? "JWT" : "session token",
  });
  app.doc("/openapi.json", {
    openapi: "3.0.0",
    info: {
      title: "Tasks API",
      version: "1.0.0",
      description:
        "MIS 233 Assignment 5, Kamil Postaağası. Log in with POST /auth/login, " +
        "then press Authorize and paste the token.",
    },
  });
  app.get("/docs", swaggerUI({ url: "/openapi.json", persistAuthorization: true }));

  app.notFound((c) => fail(c, 404, "not found"));
  app.onError((err, c) => {
    // Hono throws these before Zod can run: a body that is not JSON (400), or a body
    // sent without "content-type: application/json" (415). Same shape as every error.
    if (err instanceof HTTPException && err.status === 400) {
      return fail(c, 400, "validation failed", [{ path: [], message: err.message }]);
    }
    if (err instanceof HTTPException && err.status === 415) {
      return fail(c, 415, "send the body as JSON with content-type: application/json");
    }
    // Anything else: details go to the log, not to the client; the id links the two.
    console.error(JSON.stringify({ requestId: c.get("requestId"), error: String(err) }));
    console.error(err);
    return fail(c, 500, "internal error");
  });
  return app;
}
