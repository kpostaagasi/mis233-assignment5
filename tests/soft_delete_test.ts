// Kamil Postaağası, 2023501030
import { assertEquals, assertRejects } from "@std/assert";
import { count } from "drizzle-orm";
import { users } from "../src/schema.ts";
import { registerUser } from "../src/users_repo.ts";
import { freshApp, freshEnv, login, send } from "./helpers.ts";

Deno.test("a deleted task is not listed and not found, but the row is still there", async () => {
  const { app, db } = await freshEnv();
  const token = await login(app);
  const task = await (await send(app, "POST", "/api/tasks", { title: "Old" }, token))
    .json();
  await send(app, "DELETE", `/api/tasks/${task.id}`, undefined, token);

  const list = await (await send(app, "GET", "/api/tasks", undefined, token)).json();
  assertEquals(list.total, 0);
  assertEquals(
    (await send(app, "GET", `/api/tasks/${task.id}`, undefined, token)).status,
    404,
  );
  // deleting twice is a 404: it is already gone for the user
  assertEquals(
    (await send(app, "DELETE", `/api/tasks/${task.id}`, undefined, token)).status,
    404,
  );

  const rows = await db.client.execute("SELECT deleted_at FROM tasks");
  assertEquals(rows.rows.length, 1);
  assertEquals(typeof rows.rows[0].deleted_at, "number");
  // and the trash view shows it
  const trash =
    await (await send(app, "GET", "/api/tasks?deleted=true", undefined, token)).json();
  assertEquals(trash.items.map((t: { id: number }) => t.id), [task.id]);
});

Deno.test("restore brings a deleted task back; restoring a live task is 404", async () => {
  const app = await freshApp();
  const token = await login(app);
  const task = await (await send(app, "POST", "/api/tasks", { title: "Oops" }, token))
    .json();
  const live = await send(app, "POST", `/api/tasks/${task.id}/restore`, undefined, token);
  assertEquals(live.status, 404);

  await send(app, "DELETE", `/api/tasks/${task.id}`, undefined, token);
  const back = await send(app, "POST", `/api/tasks/${task.id}/restore`, undefined, token);
  assertEquals(back.status, 200);
  assertEquals((await back.json()).deletedAt, null);
  assertEquals(
    (await send(app, "GET", `/api/tasks/${task.id}`, undefined, token)).status,
    200,
  );
});

Deno.test("another user cannot restore my deleted task", async () => {
  const app = await freshApp();
  const a = await login(app, "a@example.com");
  const b = await login(app, "b@example.com");
  const task = await (await send(app, "POST", "/api/tasks", { title: "mine" }, a)).json();
  await send(app, "DELETE", `/api/tasks/${task.id}`, undefined, a);
  assertEquals(
    (await send(app, "POST", `/api/tasks/${task.id}/restore`, undefined, b)).status,
    404,
  );
});

Deno.test("register creates the user and the welcome task together", async () => {
  const app = await freshApp({ welcomeTask: true });
  const token = await login(app);
  const list = await (await send(app, "GET", "/api/tasks", undefined, token)).json();
  assertEquals(list.total, 1);
  assertEquals(list.items[0].priority, "low");
});

Deno.test("if the welcome task fails, the user is rolled back too", async () => {
  const { db } = await freshEnv();
  await assertRejects(() =>
    registerUser(db, "r@example.com", "hash", () => {
      throw new Error("second insert failed");
    })
  );
  const [{ n }] = await db.db.select({ n: count() }).from(users);
  assertEquals(n, 0); // no user was left behind
});
