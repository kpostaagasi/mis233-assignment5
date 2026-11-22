// Kamil Postaağası, 2023501030
import { assert, assertEquals } from "@std/assert";
import { signToken, verifyToken } from "../src/auth.ts";
import { DEV_SECRET, testConfig } from "../src/config.ts";
import { freshApp, login, send } from "./helpers.ts";

Deno.test("login returns a JWT whose sub is the user id and that unlocks /api", async () => {
  const app = await freshApp();
  const token = await login(app);
  assertEquals(token.split(".").length, 3); // header.payload.signature
  const payload = JSON.parse(
    atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
  );
  assertEquals([payload.sub, payload.role], ["1", "user"]);
  assert(payload.exp - payload.iat === 3600, "expires after one hour");
  assertEquals((await send(app, "GET", "/api/tasks", undefined, token)).status, 200);
});

Deno.test("a tampered JWT (one character changed) is 401", async () => {
  const app = await freshApp();
  const token = await login(app);
  const [h, p, s] = token.split(".");
  const flipped = s[5] === "A" ? "B" : "A";
  const tampered = `${h}.${p}.${s.slice(0, 5)}${flipped}${s.slice(6)}`;
  const res = await send(app, "GET", "/api/tasks", undefined, tampered);
  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, "unauthorized");
});

Deno.test("an expired JWT is 401", async () => {
  const app = await freshApp();
  await login(app);
  const past = Math.floor(Date.now() / 1000) - 60; // expired a minute ago
  const expired = await signToken(1, "user", DEV_SECRET, past);
  assertEquals(await verifyToken(expired, DEV_SECRET), null);
  assertEquals((await send(app, "GET", "/api/tasks", undefined, expired)).status, 401);
});

Deno.test("a JWT signed with another secret is 401", async () => {
  const app = await freshApp();
  await login(app);
  const forged = await signToken(1, "admin", "someone-elses-secret");
  assertEquals((await send(app, "GET", "/api/tasks", undefined, forged)).status, 401);
});

Deno.test("JWT logout cannot revoke: the token still works until it expires", async () => {
  const app = await freshApp();
  const token = await login(app);
  const out = await send(app, "POST", "/auth/logout", undefined, token);
  assertEquals(await out.json(), { ok: true, revoked: false });
  assertEquals((await send(app, "GET", "/api/tasks", undefined, token)).status, 200);
});

Deno.test("session mode: same routes, and logout deletes the session row", async () => {
  const app = await freshApp({ config: testConfig({ AUTH_MODE: "session" }) });
  const token = await login(app);
  assertEquals(token.split(".").length, 1); // a random UUID, not a JWT
  assertEquals((await send(app, "GET", "/api/tasks", undefined, token)).status, 200);
  const out = await send(app, "POST", "/auth/logout", undefined, token);
  assertEquals(await out.json(), { ok: true, revoked: true });
  assertEquals((await send(app, "GET", "/api/tasks", undefined, token)).status, 401);
});
