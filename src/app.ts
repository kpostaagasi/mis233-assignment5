// Kamil Postaağası, 2023501030
import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { type Config, testConfig } from "./config.ts";
import type { Db } from "./db.ts";
import { users } from "./schema.ts";
import { checkPassword, createSession, hashPassword, requireAuth } from "./auth.ts";
import { fail, toIssues } from "./errors.ts";
import { Credentials } from "./validation.ts";
import { jsonLogger, requestLog } from "./logging.ts";
import type { Env, Logger } from "./types.ts";
import { taskRoutes } from "./tasks_routes.ts";

// A real bcrypt hash of a random string. Login compares against it when the email is
// unknown, so a wrong email takes as long as a wrong password (no timing hint).
const DUMMY_HASH = await hashPassword(crypto.randomUUID());

export type AppOptions = {
  config: Config;
  log: Logger; // where the request log lines go (tests collect them)
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

  app.post("/auth/register", async (c) => {
    const parsed = Credentials.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return fail(c, 400, "validation failed", toIssues(parsed.error.issues));
    }
    const { email, password } = parsed.data;

    const [taken] = await db.db.select({ id: users.id }).from(users).where(
      eq(users.email, email),
    );
    if (taken) return fail(c, 409, "email already registered");

    const [user] = await db.db.insert(users)
      .values({ email, passwordHash: await hashPassword(password) })
      .returning({ id: users.id, email: users.email });
    return c.json(user, 201);
  });

  app.post("/auth/login", async (c) => {
    const parsed = Credentials.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return fail(c, 400, "validation failed", toIssues(parsed.error.issues));
    }
    const { email, password } = parsed.data;

    const [user] = await db.db.select().from(users).where(eq(users.email, email));
    const ok = await checkPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) return fail(c, 401, "wrong email or password");
    return c.json({ token: await createSession(db, user.id) });
  });

  // Every /api route needs a token. The middleware runs before the routes below.
  app.use("/api/*", requireAuth(db));
  app.route("/api/tasks", taskRoutes(db));

  app.notFound((c) => fail(c, 404, "not found"));
  app.onError((err, c) => {
    // details go to the log, not to the client; the id links the two
    console.error(JSON.stringify({ requestId: c.get("requestId"), error: String(err) }));
    console.error(err);
    return fail(c, 500, "internal error");
  });
  return app;
}
