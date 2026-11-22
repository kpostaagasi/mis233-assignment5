// Kamil Postaağası, 2023501030
import { assert, assertEquals } from "@std/assert";
import { LoginLimiter } from "../src/rate_limit.ts";
import { freshApp, send } from "./helpers.ts";

const creds = { email: "rl@example.com", password: "secret123" };
const wrong = { ...creds, password: "wrong-password" };

Deno.test("five failed logins, then the sixth is 429 with Retry-After, even when right", async () => {
  const app = await freshApp();
  await send(app, "POST", "/auth/register", creds);
  for (let i = 0; i < 5; i++) {
    assertEquals((await send(app, "POST", "/auth/login", wrong)).status, 401);
  }
  const blocked = await send(app, "POST", "/auth/login", creds);
  assertEquals(blocked.status, 429);
  const retry = Number(blocked.headers.get("retry-after"));
  assert(retry > 0 && retry <= 60, `Retry-After was ${retry}`);
  assertEquals((await blocked.json()).error, "too many failed logins, try again later");
  // another email is not affected
  await send(app, "POST", "/auth/register", { ...creds, email: "other@example.com" });
  const other = await send(app, "POST", "/auth/login", {
    ...creds,
    email: "other@example.com",
  });
  assertEquals(other.status, 200);
});

Deno.test("after the window the counter starts again; a success clears it", async () => {
  let now = 1_000_000;
  const limiter = new LoginLimiter(5, 60_000, () => now);
  const app = await freshApp({ limiter });
  await send(app, "POST", "/auth/register", creds);
  for (let i = 0; i < 5; i++) await send(app, "POST", "/auth/login", wrong);
  assertEquals((await send(app, "POST", "/auth/login", creds)).status, 429);

  now += 61_000; // a minute later the window is over
  assertEquals((await send(app, "POST", "/auth/login", creds)).status, 200);

  for (let i = 0; i < 4; i++) await send(app, "POST", "/auth/login", wrong);
  await send(app, "POST", "/auth/login", creds); // success clears the 4 failures
  assertEquals(limiter.retryAfter(creds.email), 0);
  for (let i = 0; i < 4; i++) await send(app, "POST", "/auth/login", wrong);
  assertEquals((await send(app, "POST", "/auth/login", creds)).status, 200);
});
