// Kamil Postaağası, 2023501030
import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  summary,
  summaryNaive,
  usersOverview,
  usersOverviewNaive,
} from "../src/summary.ts";
import { countingDb } from "../scripts/query_counter.ts";
import { freshEnv, login, send } from "./helpers.ts";

Deno.test("GET /api/me/summary counts my live tasks per status", async () => {
  const { app } = await freshEnv();
  const token = await login(app);
  const other = await login(app, "other@example.com");
  for (const status of ["todo", "done", "done", "in-progress"]) {
    await send(app, "POST", "/api/tasks", { title: status, status }, token);
  }
  await send(app, "POST", "/api/tasks", { title: "not mine", status: "done" }, other);
  await send(app, "DELETE", "/api/tasks/1", undefined, token); // a deleted todo does not count

  const res = await send(app, "GET", "/api/me/summary", undefined, token);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { "todo": 0, "in-progress": 1, "done": 2, total: 3 });
  assertEquals((await app.request("/api/me/summary")).status, 401);
});

Deno.test("naive and good versions agree, but the good ones send a single query", async () => {
  const { app, db } = await freshEnv();
  for (const email of ["a@example.com", "b@example.com", "c@example.com"]) {
    const token = await login(app, email);
    await send(app, "POST", "/api/tasks", { title: "x", status: "done" }, token);
  }
  const naive = countingDb(db.client);
  const good = countingDb(db.client);
  assertEquals(await summaryNaive(naive.db, 1), await summary(good.db, 1));
  assertEquals([naive.counter.queries.length, good.counter.queries.length], [4, 1]);

  const n2 = countingDb(db.client);
  const g2 = countingDb(db.client);
  assertEquals(await usersOverviewNaive(n2.db), await usersOverview(g2.db));
  assertEquals([n2.counter.queries.length, g2.counter.queries.length], [1 + 3, 1]);
});

Deno.test("the list query uses the index (EXPLAIN QUERY PLAN)", async () => {
  const { db } = await freshEnv();
  const res = await db.client.execute({
    sql: "EXPLAIN QUERY PLAN SELECT * FROM tasks WHERE user_id = ? AND status = ?",
    args: [1, "done"],
  });
  assertStringIncludes(String(res.rows[0].detail), "USING INDEX idx_tasks_user_status");
});
