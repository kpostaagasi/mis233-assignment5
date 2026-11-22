// Kamil Postaağası, 2023501030
import { assertEquals, assertNotEquals } from "@std/assert";
import { TaskCache } from "../src/cache.ts";
import type { Task } from "../src/schema.ts";
import { freshEnv, kv, login, send } from "./helpers.ts";

const task = (id: number, userId: number, title: string): Task => ({
  id,
  userId,
  title,
  status: "todo",
  priority: "medium",
  createdAt: 0,
  dueDate: null,
  deletedAt: null,
  attachment: null,
});

Deno.test("cache: the second read is a hit and does not touch the database", async () => {
  const cache = new TaskCache(kv, `t-${crypto.randomUUID()}`);
  let reads = 0;
  const load = () => {
    reads++;
    return Promise.resolve(task(1, 1, "a"));
  };
  assertEquals((await cache.getOrLoad(1, 1, load)).hit, false);
  assertEquals((await cache.getOrLoad(1, 1, load)).hit, true);
  assertEquals([reads, cache.dbReads], [1, 1]);
});

Deno.test("cache: the key includes the user id", async () => {
  const cache = new TaskCache(kv, `t-${crypto.randomUUID()}`);
  assertEquals(cache.key(7, 3).slice(1), [7, 3]);
  await cache.getOrLoad(1, 3, () => Promise.resolve(task(3, 1, "user 1's task")));
  // user 2 asks for the same task id: a miss, so the owner check in the loader runs
  const other = await cache.getOrLoad(2, 3, () => Promise.resolve(undefined));
  assertEquals([other.hit, other.task], [false, undefined]);
});

Deno.test("GET /api/tasks/:id: miss, hit, and after PUT a fresh value, never stale", async () => {
  const { app } = await freshEnv();
  const token = await login(app);
  const t = await (await send(app, "POST", "/api/tasks", { title: "v1" }, token)).json();
  const get = () => send(app, "GET", `/api/tasks/${t.id}`, undefined, token);

  assertEquals((await get()).headers.get("x-cache"), "miss");
  assertEquals((await get()).headers.get("x-cache"), "hit");

  await send(app, "PUT", `/api/tasks/${t.id}`, { title: "v2" }, token);
  const after = await get();
  assertEquals(after.headers.get("x-cache"), "miss"); // the entry was deleted
  assertEquals((await after.json()).title, "v2");

  await send(app, "DELETE", `/api/tasks/${t.id}`, undefined, token);
  assertEquals((await get()).status, 404); // a deleted task is not served from the cache
});

Deno.test("GET /api/tasks/:id: another user never gets my cached task", async () => {
  const { app } = await freshEnv();
  const a = await login(app, "a@example.com");
  const b = await login(app, "b@example.com");
  const t = await (await send(app, "POST", "/api/tasks", { title: "A only" }, a)).json();
  await send(app, "GET", `/api/tasks/${t.id}`, undefined, a); // now cached for A
  const res = await send(app, "GET", `/api/tasks/${t.id}`, undefined, b);
  assertNotEquals(res.headers.get("x-cache"), "hit");
  assertEquals(res.status, 404);
});
