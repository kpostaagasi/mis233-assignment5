// Kamil Postaağası, 2023501030
import { assertEquals } from "@std/assert";
import { asc } from "drizzle-orm";
import { purgeOldDone } from "../src/purge.ts";
import { tasks, users } from "../src/schema.ts";
import { freshEnv, login, send } from "./helpers.ts";

const DAY = 86_400;

Deno.test("purgeOldDone removes only tasks done more than 30 days ago, and is idempotent", async () => {
  const { db } = await freshEnv();
  const now = Math.floor(Date.now() / 1000);
  const [u] = await db.db.insert(users).values({
    email: "p@example.com",
    passwordHash: "x",
  })
    .returning();
  await db.db.insert(tasks).values([
    {
      userId: u.id,
      title: "done 40 days ago",
      status: "done",
      completedAt: now - 40 * DAY,
    },
    {
      userId: u.id,
      title: "done 31 days ago",
      status: "done",
      completedAt: now - 31 * DAY,
    },
    {
      userId: u.id,
      title: "done 5 days ago",
      status: "done",
      completedAt: now - 5 * DAY,
    },
    { userId: u.id, title: "old but not done", status: "todo", completedAt: null },
  ]);

  assertEquals(await purgeOldDone(db, 30, undefined, now), 2);
  assertEquals(await purgeOldDone(db, 30, undefined, now), 0); // second run: nothing left
  const left = await db.db.select({ title: tasks.title }).from(tasks).orderBy(
    asc(tasks.id),
  );
  assertEquals(left.map((t) => t.title), ["done 5 days ago", "old but not done"]);
});

Deno.test("completedAt is set when a task becomes done and cleared when it leaves done", async () => {
  const { app } = await freshEnv();
  const token = await login(app);
  const t = await (await send(app, "POST", "/api/tasks", { title: "x" }, token)).json();
  assertEquals(t.completedAt, null);
  const done = await (
    await send(app, "PUT", `/api/tasks/${t.id}`, { title: "x", status: "done" }, token)
  ).json();
  assertEquals(typeof done.completedAt, "number");
  const renamed = await (
    await send(app, "PUT", `/api/tasks/${t.id}`, { title: "y", status: "done" }, token)
  ).json();
  assertEquals(renamed.completedAt, done.completedAt); // renaming keeps the clock
  const back = await (
    await send(app, "PUT", `/api/tasks/${t.id}`, { title: "y", status: "todo" }, token)
  ).json();
  assertEquals(back.completedAt, null);
});
