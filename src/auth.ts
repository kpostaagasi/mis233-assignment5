// Kamil Postaağası, 2023501030
import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import type { MiddlewareHandler } from "hono";
import type { Db } from "./db.ts";
import { fail } from "./errors.ts";
import { type Role, ROLES } from "./schema.ts";
import type { Env } from "./types.ts";

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);
export const checkPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

const SESSION_SECONDS = 60 * 60; // a session lives for one hour

// ---------------------------------------------------------------- sessions (given, R3)

/** Log a user in: store a random token for them and return it. */
export async function createSession(db: Db, userId: number): Promise<string> {
  const token = crypto.randomUUID();
  await db.client.execute({
    sql:
      "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, strftime('%s','now') + ?)",
    args: [token, userId, SESSION_SECONDS],
  });
  return token;
}

/** Return the user id that owns a valid, unexpired token, or null. */
export async function userIdFromToken(db: Db, token: string): Promise<number | null> {
  const res = await db.client.execute({
    sql:
      "SELECT user_id FROM sessions WHERE token = ? AND expires_at > strftime('%s','now')",
    args: [token],
  });
  const id = res.rows[0]?.user_id;
  return id === undefined ? null : Number(id);
}

// ---------------------------------------------------------------- JWT (Bonus 7)

/**
 * A signed token: the user id in "sub", the role in "role", valid for one hour.
 * Nobody can change it without the secret, so the server can trust it without a lookup.
 */
export function signToken(
  userId: number,
  role: Role,
  secret: string,
  expiresIn: string | number = "1h",
): Promise<string> {
  return new SignJWT({ role }).setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId)).setIssuedAt().setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode(secret));
}

/** The caller behind a token, or null for a bad, tampered or expired token. */
export async function verifyToken(
  token: string,
  secret: string,
): Promise<Principal | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"], // never accept "none" or another algorithm
    });
    const userId = Number(payload.sub);
    const role = ROLES.find((r) => r === payload.role);
    if (!Number.isInteger(userId) || !role) return null;
    return { userId, role };
  } catch {
    return null; // bad signature, malformed or expired
  }
}

// ---------------------------------------------------------------- one interface for both

/** Who is calling. */
export type Principal = { userId: number; role: Role };

/** The routes do not care how a token works; they only issue, check and revoke it. */
export interface TokenService {
  issue(user: { id: number; role: Role }): Promise<string>;
  verify(token: string): Promise<Principal | null>;
  /** Returns true when the token can no longer be used. */
  revoke(token: string): Promise<boolean>;
}

/** Tokens are rows in the sessions table: one lookup per request, and logout really works. */
export function sessionTokens(db: Db): TokenService {
  return {
    issue: (user) => createSession(db, user.id),
    async verify(token) {
      const userId = await userIdFromToken(db, token);
      if (userId === null) return null;
      const res = await db.client.execute({
        sql: "SELECT role FROM users WHERE id = ?",
        args: [userId],
      });
      const role = ROLES.find((r) => r === res.rows[0]?.role);
      return role ? { userId, role } : null;
    },
    async revoke(token) {
      await db.client.execute({
        sql: "DELETE FROM sessions WHERE token = ?",
        args: [token],
      });
      return true;
    },
  };
}

/** Tokens are JWTs: no lookup, but a token stays valid until it expires. */
export function jwtTokens(secret: string): TokenService {
  return {
    issue: (user) => signToken(user.id, user.role, secret),
    verify: (token) => verifyToken(token, secret),
    revoke: () => Promise.resolve(false), // nothing to delete: the cost of a JWT
  };
}

// ---------------------------------------------------------------- middlewares

/** Read "Authorization: Bearer <token>" and return the token, or "" when there is none. */
export function bearerToken(header: string | undefined): string {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  return match ? match[1] : "";
}

/**
 * Stops the request with 401 unless it carries a valid token. Otherwise the user id and
 * the role are stored in the context, so a route never trusts an id from the body or URL.
 */
export const requireAuth =
  (tokens: TokenService): MiddlewareHandler<Env> => async (c, next) => {
    const token = bearerToken(c.req.header("authorization"));
    const who = token ? await tokens.verify(token) : null;
    if (who === null) return fail(c, 401, "unauthorized");
    c.set("userId", who.userId);
    c.set("role", who.role);
    await next();
  };

/** Bonus 9: 401 when nobody is logged in, 403 when the role is not one of these. */
export const requireRole =
  (...roles: Role[]): MiddlewareHandler<Env> => async (c, next) => {
    const role = c.get("role");
    if (!role) return fail(c, 401, "unauthorized");
    if (!roles.includes(role)) return fail(c, 403, "forbidden");
    await next();
  };
