// Kamil Postaağası, 2023501030
import { assert, assertEquals } from "@std/assert";
import { freshApp, send } from "./helpers.ts";

const ayse = { email: "ayse@example.com", password: "secret123" };

Deno.test("register answers 201 with id and email, never the hash", async () => {
  const app = await freshApp();
  const res = await send(app, "POST", "/auth/register", ayse);
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body, { id: 1, email: "ayse@example.com" });
});

Deno.test("register with an email that is taken is 409", async () => {
  const app = await freshApp();
  await send(app, "POST", "/auth/register", ayse);
  // the same email in capitals is still the same email
  const res = await send(app, "POST", "/auth/register", {
    ...ayse,
    email: "AYSE@example.com",
  });
  assertEquals(res.status, 409);
  assertEquals((await res.json()).error, "email already registered");
});

Deno.test("register with a bad body is 400 with the issues", async () => {
  const app = await freshApp();
  const res = await send(app, "POST", "/auth/register", {
    email: "nope",
    password: "short",
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "validation failed");
  assertEquals(body.issues.map((i: { path: string[] }) => i.path[0]), [
    "email",
    "password",
  ]);
});

Deno.test("register with a body that is not JSON is 400, not a crash", async () => {
  const app = await freshApp();
  const res = await app.request("/auth/register", { method: "POST", body: "{oops" });
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "validation failed");
});

Deno.test("login with the right password returns a token", async () => {
  const app = await freshApp();
  await send(app, "POST", "/auth/register", ayse);
  const res = await send(app, "POST", "/auth/login", ayse);
  assertEquals(res.status, 200);
  const { token } = await res.json();
  assert(typeof token === "string" && token.length > 20);
});

Deno.test("a wrong password and an unknown email give the same 401", async () => {
  const app = await freshApp();
  await send(app, "POST", "/auth/register", ayse);
  const wrongPassword = await send(app, "POST", "/auth/login", {
    ...ayse,
    password: "wrong-pw",
  });
  const wrongEmail = await send(app, "POST", "/auth/login", {
    ...ayse,
    email: "x@example.com",
  });
  assertEquals(wrongPassword.status, 401);
  assertEquals(wrongEmail.status, 401);
  assertEquals(await wrongPassword.json(), await wrongEmail.json());
});

Deno.test("the stored password is a bcrypt hash", async () => {
  const { createDb, migrate } = await import("../src/db.ts");
  const { createApp } = await import("../src/app.ts");
  const file = await Deno.makeTempFile({ suffix: ".db" });
  const db = createDb(`file:${file}`);
  await migrate(db);
  await send(createApp(db), "POST", "/auth/register", ayse);
  const res = await db.client.execute("SELECT password_hash FROM users");
  const hash = String(res.rows[0].password_hash);
  assert(hash.startsWith("$2"), "bcrypt hashes start with $2");
  assert(!hash.includes(ayse.password));
});
