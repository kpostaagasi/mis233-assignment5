// Kamil Postaağası, 2023501030
import { assertEquals } from "@std/assert";
import { promoteAdmin } from "../src/users_repo.ts";
import { freshEnv, login, send } from "./helpers.ts";

Deno.test("GET /api/admin/users: no token 401, normal user 403, admin 200", async () => {
  const { app, db } = await freshEnv();
  const userToken = await login(app, "user@example.com");
  await login(app, "boss@example.com");
  await promoteAdmin(db, "boss@example.com");
  // log in again: the role is a claim in the token, so the old token still says "user"
  const adminRes = await send(app, "POST", "/auth/login", {
    email: "boss@example.com",
    password: "secret123",
  });
  const adminToken = (await adminRes.json()).token;

  const anon = await app.request("/api/admin/users");
  assertEquals([anon.status, (await anon.json()).error], [401, "unauthorized"]);

  const user = await send(app, "GET", "/api/admin/users", undefined, userToken);
  assertEquals([user.status, (await user.json()).error], [403, "forbidden"]);

  const admin = await send(app, "GET", "/api/admin/users", undefined, adminToken);
  assertEquals(admin.status, 200);
  const list = await admin.json();
  assertEquals(list.map((u: { email: string; role: string }) => [u.email, u.role]), [
    ["user@example.com", "user"],
    ["boss@example.com", "admin"],
  ]);
});

Deno.test("promoteAdmin only promotes an account that exists", async () => {
  const { db } = await freshEnv();
  assertEquals(await promoteAdmin(db, "nobody@example.com"), false);
});
