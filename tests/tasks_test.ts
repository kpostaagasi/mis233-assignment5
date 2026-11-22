// Kamil Postaağası, 2023501030
import { assertEquals } from "@std/assert";
import { freshApp, login, send } from "./helpers.ts";

Deno.test("GET /api/tasks without a token is 401 in the error shape", async () => {
  const app = await freshApp();
  const res = await app.request("/api/tasks");
  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, "unauthorized");
});

Deno.test("a made-up token is 401 as well", async () => {
  const app = await freshApp();
  const res = await send(app, "GET", "/api/tasks", undefined, "not-a-real-token");
  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, "unauthorized");
});

Deno.test("create a task (201 with defaults), then read it and list it", async () => {
  const app = await freshApp();
  const token = await login(app);
  const created = await send(app, "POST", "/api/tasks", { title: "Buy milk" }, token);
  assertEquals(created.status, 201);
  const task = await created.json();
  assertEquals([task.title, task.status, task.priority], ["Buy milk", "todo", "medium"]);

  const one = await send(app, "GET", `/api/tasks/${task.id}`, undefined, token);
  assertEquals(one.status, 200);
  assertEquals((await one.json()).id, task.id);

  const list = await (await send(app, "GET", "/api/tasks", undefined, token)).json();
  assertEquals(list.total, 1);
  assertEquals(list.items[0].title, "Buy milk");
});

Deno.test("create with an invalid status is 400 and names the field", async () => {
  const app = await freshApp();
  const token = await login(app);
  const res = await send(
    app,
    "POST",
    "/api/tasks",
    { title: "x", status: "finished" },
    token,
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "validation failed");
  assertEquals(body.issues[0].path, ["status"]);
});

Deno.test("create with an empty or a too long title is 400", async () => {
  const app = await freshApp();
  const token = await login(app);
  const empty = await send(app, "POST", "/api/tasks", { title: "   " }, token);
  const long = await send(app, "POST", "/api/tasks", { title: "a".repeat(101) }, token);
  assertEquals([empty.status, long.status], [400, 400]);
});

Deno.test("PUT replaces the task and DELETE removes it", async () => {
  const app = await freshApp();
  const token = await login(app);
  const task = await (await send(app, "POST", "/api/tasks", { title: "Draft" }, token))
    .json();

  const put = await send(app, "PUT", `/api/tasks/${task.id}`, {
    title: "Final",
    status: "done",
    priority: "high",
  }, token);
  assertEquals(put.status, 200);
  const updated = await put.json();
  assertEquals([updated.title, updated.status, updated.priority], [
    "Final",
    "done",
    "high",
  ]);

  const del = await send(app, "DELETE", `/api/tasks/${task.id}`, undefined, token);
  assertEquals([del.status, await del.json()], [200, { ok: true }]);
  const gone = await send(app, "GET", `/api/tasks/${task.id}`, undefined, token);
  assertEquals(gone.status, 404);
});

Deno.test("user B cannot read, change or delete user A's task (404 each)", async () => {
  const app = await freshApp();
  const a = await login(app, "a@example.com");
  const b = await login(app, "b@example.com");
  const task = await (await send(app, "POST", "/api/tasks", { title: "A's secret" }, a))
    .json();
  const path = `/api/tasks/${task.id}`;

  const read = await send(app, "GET", path, undefined, b);
  const change = await send(app, "PUT", path, { title: "hacked" }, b);
  const remove = await send(app, "DELETE", path, undefined, b);
  assertEquals([read.status, change.status, remove.status], [404, 404, 404]);
  assertEquals((await read.json()).error, "task not found");

  // and A's task is untouched
  const mine = await (await send(app, "GET", path, undefined, a)).json();
  assertEquals(mine.title, "A's secret");
  // B's list is empty
  assertEquals(
    (await (await send(app, "GET", "/api/tasks", undefined, b)).json()).total,
    0,
  );
});

Deno.test("pagination: 3 tasks, page 2 with limit 2 holds the third one", async () => {
  const app = await freshApp();
  const token = await login(app);
  for (const title of ["one", "two", "three"]) {
    await send(app, "POST", "/api/tasks", { title }, token);
  }
  const res = await send(app, "GET", "/api/tasks?page=2&limit=2", undefined, token);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals([body.page, body.limit, body.total], [2, 2, 3]);
  assertEquals(body.items.map((t: { title: string }) => t.title), ["three"]);
});

Deno.test("filter by status and priority; total counts only the matches", async () => {
  const app = await freshApp();
  const token = await login(app);
  await send(app, "POST", "/api/tasks", { title: "a", status: "done" }, token);
  await send(
    app,
    "POST",
    "/api/tasks",
    { title: "b", status: "done", priority: "high" },
    token,
  );
  await send(app, "POST", "/api/tasks", { title: "c" }, token);
  const done = await (await send(app, "GET", "/api/tasks?status=done", undefined, token))
    .json();
  assertEquals(done.total, 2);
  const urgent = await (
    await send(app, "GET", "/api/tasks?status=done&priority=high", undefined, token)
  ).json();
  assertEquals(urgent.items.map((t: { title: string }) => t.title), ["b"]);
});

Deno.test("a bad query (page=abc, limit=1000, status=later) is 400, not a crash", async () => {
  const app = await freshApp();
  const token = await login(app);
  for (const q of ["page=abc", "limit=1000", "limit=0", "status=later"]) {
    const res = await send(app, "GET", `/api/tasks?${q}`, undefined, token);
    assertEquals(res.status, 400, q);
    assertEquals((await res.json()).error, "validation failed");
  }
});

Deno.test("an id that is not a number is 400; an unknown route is 404 in the same shape", async () => {
  const app = await freshApp();
  const token = await login(app);
  const bad = await send(app, "GET", "/api/tasks/abc", undefined, token);
  assertEquals(bad.status, 400);
  const unknown = await app.request("/nothing-here");
  assertEquals(unknown.status, 404);
  assertEquals((await unknown.json()).error, "not found");
});

Deno.test("dueDate is optional, must be a real date, and comes back as text", async () => {
  const app = await freshApp();
  const token = await login(app);
  const ok = await send(app, "POST", "/api/tasks", {
    title: "Midterm",
    dueDate: "2026-12-04",
  }, token);
  assertEquals((await ok.json()).dueDate, "2026-12-04");
  const bad = await send(
    app,
    "POST",
    "/api/tasks",
    { title: "x", dueDate: "2026-13-40" },
    token,
  );
  assertEquals(bad.status, 400);
});
