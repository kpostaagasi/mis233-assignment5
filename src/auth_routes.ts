// Kamil Postaağası, 2023501030
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Db } from "./db.ts";
import { users } from "./schema.ts";
import {
  bearerToken,
  checkPassword,
  hashPassword,
  requireAuth,
  type TokenService,
} from "./auth.ts";
import { fail, toIssues } from "./errors.ts";
import type { LoginLimiter } from "./rate_limit.ts";
import type { Env } from "./types.ts";
import { Credentials } from "./validation.ts";
import { addWelcomeTask, registerUser } from "./users_repo.ts";

// A real bcrypt hash of a random string. Login compares against it when the email is
// unknown, so a wrong email takes as long as a wrong password (no timing hint).
const DUMMY_HASH = await hashPassword(crypto.randomUUID());

export type AuthDeps = {
  db: Db;
  tokens: TokenService;
  limiter: LoginLimiter;
  welcomeTask: boolean;
};

/** POST /auth/register, /auth/login and /auth/logout. */
export function authRoutes({ db, tokens, limiter, welcomeTask }: AuthDeps) {
  const r = new Hono<Env>();

  r.post("/register", async (c) => {
    const parsed = Credentials.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return fail(c, 400, "validation failed", toIssues(parsed.error.issues));
    }
    const { email, password } = parsed.data;

    const [taken] = await db.db.select({ id: users.id }).from(users)
      .where(eq(users.email, email));
    if (taken) return fail(c, 409, "email already registered");

    const passwordHash = await hashPassword(password);
    const user = await registerUser(
      db,
      email,
      passwordHash,
      welcomeTask ? addWelcomeTask : null,
    );
    return c.json(user, 201); // id, email and role; never the hash
  });

  r.post("/login", async (c) => {
    const parsed = Credentials.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return fail(c, 400, "validation failed", toIssues(parsed.error.issues));
    }
    const { email, password } = parsed.data;

    // Bonus 15: checked before the password, so even the right password waits.
    const wait = limiter.retryAfter(email);
    if (wait > 0) {
      c.header("Retry-After", String(wait));
      return fail(c, 429, "too many failed logins, try again later");
    }

    const [user] = await db.db.select().from(users).where(eq(users.email, email));
    const ok = await checkPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      limiter.fail(email);
      return fail(c, 401, "wrong email or password");
    }
    limiter.clear(email);
    return c.json({ token: await tokens.issue(user) });
  });

  // With sessions the row is deleted and the token dies at once. A JWT cannot be taken
  // back: it keeps working until it expires. "revoked" tells the client which happened.
  r.post("/logout", requireAuth(tokens), async (c) => {
    const revoked = await tokens.revoke(bearerToken(c.req.header("authorization")));
    return c.json({ ok: true, revoked });
  });

  return r;
}
