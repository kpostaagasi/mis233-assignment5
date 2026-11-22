// Kamil Postaağası, 2023501030
import { assertEquals } from "@std/assert";
import { DEMO_USERS, seed } from "../scripts/seed.ts";
import { freshEnv, send } from "./helpers.ts";

Deno.test("seed fills an empty database and does nothing the second time", async () => {
  const { app, db } = await freshEnv();
  assertEquals(await seed(db), { usersAdded: 2, tasksAdded: 20 });
  assertEquals(await seed(db), { usersAdded: 0, tasksAdded: 0 });

  const [demo] = DEMO_USERS;
  const login = await send(app, "POST", "/auth/login", demo);
  const { token } = await login.json();
  const list = await (await send(app, "GET", "/api/tasks?limit=100", undefined, token))
    .json();
  assertEquals(list.total, 10);
});

Deno.test("the seeded admin can open the admin route", async () => {
  const { app, db } = await freshEnv();
  await seed(db);
  const admin = DEMO_USERS[1];
  const { token } = await (await send(app, "POST", "/auth/login", admin)).json();
  assertEquals(
    (await send(app, "GET", "/api/admin/users", undefined, token)).status,
    200,
  );
});
