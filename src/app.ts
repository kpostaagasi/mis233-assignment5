// Kamil Postaağası, 2023501030
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Db } from "./db.ts";
import { users } from "./schema.ts";
import { checkPassword, createSession, hashPassword } from "./auth.ts";
import { fail, toIssues } from "./errors.ts";
import { Credentials } from "./validation.ts";

// A real bcrypt hash of a random string. Login compares against it when the email is
// unknown, so a wrong email takes as long as a wrong password (no timing hint).
const DUMMY_HASH = await hashPassword(crypto.randomUUID());

/** Build the whole application around a database, so tests can give it their own. */
export function createApp(db: Db) {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

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

  app.notFound((c) => fail(c, 404, "not found"));
  app.onError((err, c) => {
    console.error(err); // details go to the log, not to the client
    return fail(c, 500, "internal error");
  });
  return app;
}
