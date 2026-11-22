// Kamil Postaağası, 2023501030
import { type AppOptions, createApp } from "../src/app.ts";
import { createDb, migrate } from "../src/db.ts";
import { testConfig } from "../src/config.ts";

/**
 * One in-memory Deno KV for the whole test file, opened outside any test so the resource
 * sanitizer does not complain. Each app gets its own key prefix, so tests never share
 * cache entries.
 */
export const kv = await Deno.openKv(":memory:");

type App = ReturnType<typeof createApp>;

/**
 * Every test gets a fresh, empty database in its own temporary file.
 * (An in-memory database loses its tables after a transaction with libSQL,
 * so a temporary file is the safe choice.)
 */
export async function freshApp(options: Partial<AppOptions> = {}) {
  return (await freshEnv(options)).app;
}

/**
 * Like freshApp, but also hands back the database. The required-part tests count tasks
 * exactly, so the Bonus 2 welcome task is off here unless a test turns it on.
 */
export async function freshEnv(options: Partial<AppOptions> = {}) {
  const file = await Deno.makeTempFile({ suffix: ".db" });
  const db = createDb(`file:${file}`);
  await migrate(db);
  const config = options.config ?? testConfig({ UPLOAD_DIR: await Deno.makeTempDir() });
  const cachePrefix = `task-${crypto.randomUUID()}`;
  const app = createApp(db, { welcomeTask: false, kv, cachePrefix, ...options, config });
  return { db, app, config };
}

/** Send a JSON request, optionally with a token. */
export function send(
  app: App,
  method: string,
  path: string,
  body?: unknown,
  token?: string,
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return app.request(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Register a user and log in; returns the token. */
export async function login(
  app: App,
  email = "ayse@example.com",
  password = "secret123",
) {
  await send(app, "POST", "/auth/register", { email, password });
  const res = await send(app, "POST", "/auth/login", { email, password });
  const body = await res.json();
  return body.token as string;
}
