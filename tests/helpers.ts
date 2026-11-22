// Kamil Postaağası, 2023501030
import { createApp } from "../src/app.ts";
import { createDb, migrate } from "../src/db.ts";

type App = ReturnType<typeof createApp>;

/**
 * Every test gets a fresh, empty database in its own temporary file.
 * (An in-memory database loses its tables after a transaction with libSQL,
 * so a temporary file is the safe choice.)
 */
export async function freshApp() {
  const file = await Deno.makeTempFile({ suffix: ".db" });
  const db = createDb(`file:${file}`);
  await migrate(db);
  return createApp(db);
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
