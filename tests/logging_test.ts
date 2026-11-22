// Kamil Postaağası, 2023501030
import { assert, assertEquals, assertMatch } from "@std/assert";
import { createApp } from "../src/app.ts";
import { createDb, migrate } from "../src/db.ts";
import type { LogLine } from "../src/types.ts";
import { send } from "./helpers.ts";

async function appWithLog() {
  const file = await Deno.makeTempFile({ suffix: ".db" });
  const db = createDb(`file:${file}`);
  await migrate(db);
  const lines: LogLine[] = [];
  return { app: createApp(db, { log: (l) => lines.push(l) }), lines };
}

const UUID = /^[0-9a-f-]{36}$/;

Deno.test("every response has an x-request-id header and leaves one log line", async () => {
  const { app, lines } = await appWithLog();
  const res = await app.request("/health");
  const id = res.headers.get("x-request-id") ?? "";
  assertMatch(id, UUID);
  assertEquals(lines.length, 1);
  assertEquals(lines[0].requestId, id);
  assertEquals([lines[0].method, lines[0].path, lines[0].status], [
    "GET",
    "/health",
    200,
  ]);
  assert(typeof lines[0].ms === "number");
});

Deno.test("error bodies carry the same request id as the header", async () => {
  const { app } = await appWithLog();
  const res = await app.request("/no-such-route");
  const body = await res.json();
  assertEquals(res.status, 404);
  assertEquals(body.requestId, res.headers.get("x-request-id"));
});

Deno.test("no log line contains a password or a token", async () => {
  const { app, lines } = await appWithLog();
  const password = "very-secret-pw";
  await send(app, "POST", "/auth/register", { email: "l@example.com", password });
  const login = await send(app, "POST", "/auth/login", {
    email: "l@example.com",
    password,
  });
  const { token } = await login.json();
  await send(app, "GET", "/api/tasks?limit=5", undefined, token);
  const all = lines.map((l) => JSON.stringify(l)).join("\n");
  assertEquals(lines.length, 3);
  assert(!all.includes(password), "password leaked into the log");
  assert(!all.includes(token), "token leaked into the log");
  assertEquals(lines[2].userId, 1); // but we do know who it was
});
