// Kamil Postaağası, 2023501030
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { type Config, testConfig } from "./config.ts";
import { type Db, withConnection } from "./db.ts";
import { jwtTokens, requireAuth, requireRole, sessionTokens } from "./auth.ts";
import { authRoutes } from "./auth_routes.ts";
import { fail } from "./errors.ts";
import { LoginLimiter } from "./rate_limit.ts";
import { jsonLogger, requestLog } from "./logging.ts";
import type { Env, Logger } from "./types.ts";
import { taskRoutes } from "./tasks_routes.ts";
import { summary, usersOverview } from "./summary.ts";

export type AppOptions = {
  config: Config;
  log: Logger; // where the request log lines go (tests collect them)
  welcomeTask: boolean; // Bonus 2: register also creates a first task (default true)
  limiter: LoginLimiter; // Bonus 15: tests pass one with a fake clock
};

/** Build the whole application around a database, so tests can give it their own. */
export function createApp(db: Db, options: Partial<AppOptions> = {}) {
  const config = options.config ?? testConfig();
  const log = options.log ?? (config.APP_ENV === "test" ? () => {} : jsonLogger);
  const app = new Hono<Env>();
  app.use("*", requestLog(log));
  const startedAt = Date.now();

  app.get("/health", (c) => c.json({ ok: true }));

  // Liveness: the process is up and answers. A platform restarts the app when this fails.
  app.get(
    "/healthz",
    (c) =>
      c.json({ ok: true, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) }),
  );

  // Readiness: the app can do real work, so the database must answer too.
  app.get("/readyz", async (c) => {
    try {
      await db.db.run(sql`SELECT 1`);
      return c.json({ ready: true });
    } catch (err) {
      console.error(err);
      return fail(c, 503, "database not ready");
    }
  });

  const tokens = config.AUTH_MODE === "jwt"
    ? jwtTokens(config.JWT_SECRET)
    : sessionTokens(db);
  const limiter = options.limiter ?? new LoginLimiter();
  app.route(
    "/auth",
    authRoutes({ db, tokens, limiter, welcomeTask: options.welcomeTask ?? true }),
  );

  // Every /api route needs a token. The middleware runs before the routes below.
  app.use("/api/*", requireAuth(tokens));
  app.use("/api/*", withConnection(db.pool));
  app.route("/api/tasks", taskRoutes());

  // Bonus 3: counts per status in one GROUP BY query.
  app.get(
    "/api/me/summary",
    async (c) => c.json(await summary(c.get("conn").db, c.get("userId"))),
  );

  // Bonus 9 and 3: admins see every user with a task count (one LEFT JOIN, no N+1).
  app.get(
    "/api/admin/users",
    requireRole("admin"),
    async (c) => c.json(await usersOverview(c.get("conn").db)),
  );

  app.notFound((c) => fail(c, 404, "not found"));
  app.onError((err, c) => {
    // details go to the log, not to the client; the id links the two
    console.error(JSON.stringify({ requestId: c.get("requestId"), error: String(err) }));
    console.error(err);
    return fail(c, 500, "internal error");
  });
  return app;
}
