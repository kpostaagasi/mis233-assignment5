// Kamil Postaağası, 2023501030
import { createRoute, z } from "@hono/zod-openapi";
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
import { fail } from "./errors.ts";
import { bearer, body, errors, json, router } from "./openapi.ts";
import type { LoginLimiter } from "./rate_limit.ts";
import { Credentials, TokenSchema, UserSchema } from "./validation.ts";
import { addWelcomeTask, registerUser } from "./users_repo.ts";

// A real bcrypt hash of a random string. Login compares against it when the email is
// unknown, so a wrong email takes as long as a wrong password (no timing hint).
const DUMMY_HASH = await hashPassword(crypto.randomUUID());

const tags = ["auth"];

const register = createRoute({
  method: "post",
  path: "/register",
  tags,
  summary: "Create an account",
  request: body(Credentials),
  responses: {
    201: json(UserSchema, "The new user, without the password hash"),
    400: errors[400],
    409: errors[409],
  },
});

const login = createRoute({
  method: "post",
  path: "/login",
  tags,
  summary: "Log in and get a token (paste it into Authorize)",
  request: body(Credentials),
  responses: {
    200: json(TokenSchema, "A token for the Authorization header"),
    400: errors[400],
    401: errors[401],
    429: {
      ...errors[429],
      headers: z.object({ "Retry-After": z.string().openapi({ example: "42" }) }),
    },
  },
});

const logout = createRoute({
  method: "post",
  path: "/logout",
  tags,
  security: bearer,
  summary: "Log out (a session is deleted; a JWT cannot be revoked)",
  responses: {
    200: json(z.object({ ok: z.literal(true), revoked: z.boolean() }), "Logged out"),
    401: errors[401],
  },
});

export type AuthDeps = {
  db: Db;
  tokens: TokenService;
  limiter: LoginLimiter;
  welcomeTask: boolean;
};

/** POST /auth/register, /auth/login and /auth/logout. */
export function authRoutes({ db, tokens, limiter, welcomeTask }: AuthDeps) {
  const r = router();

  r.openapi(register, async (c) => {
    const { email, password } = c.req.valid("json");
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

  r.openapi(login, async (c) => {
    const { email, password } = c.req.valid("json");

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
    return c.json({ token: await tokens.issue(user) }, 200);
  });

  // With sessions the row is deleted and the token dies at once. A JWT cannot be taken
  // back: it keeps working until it expires. "revoked" tells the client which happened.
  r.use("/logout", requireAuth(tokens));
  r.openapi(logout, async (c) => {
    const revoked = await tokens.revoke(bearerToken(c.req.header("authorization")));
    return c.json({ ok: true as const, revoked }, 200);
  });

  return r;
}
