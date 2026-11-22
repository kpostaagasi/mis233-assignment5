// Kamil Postaağası, 2023501030
import { assertEquals, assertRejects } from "@std/assert";
import { Pool } from "../src/pool.ts";
import { freshEnv, login, send } from "./helpers.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.test("pool: 20 concurrent jobs on a pool of 3 never run more than 3 at once", async () => {
  const pool = new Pool(["a", "b", "c"]);
  let running = 0;
  let maxRunning = 0;
  let finished = 0;
  const jobs = Array.from({ length: 20 }, (_, i) =>
    pool.use(async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await sleep(5 + (i % 4));
      running--;
      finished++;
    }));
  await Promise.all(jobs);
  assertEquals([maxRunning, finished], [3, 20]);
  assertEquals([pool.idle, pool.waiting], [3, 0]); // everything came back
});

Deno.test("pool: an item is given back even when the job throws", async () => {
  const pool = new Pool([1]);
  await assertRejects(() => pool.use(() => Promise.reject(new Error("boom"))));
  assertEquals(pool.idle, 1);
  assertEquals(await pool.use((n) => Promise.resolve(n + 1)), 2);
});

Deno.test("pool: requests borrow a connection and return it, also after errors", async () => {
  const { app, db } = await freshEnv();
  const token = await login(app);
  await Promise.all(
    Array.from(
      { length: 10 },
      (_, i) => send(app, "POST", "/api/tasks", { title: `t${i}` }, token),
    ),
  );
  await send(app, "GET", "/api/tasks/999", undefined, token); // a 404
  await send(app, "POST", "/api/tasks", { title: "" }, token); // a 400
  assertEquals(db.pool.idle, db.pool.size);
  const list = await (await send(app, "GET", "/api/tasks", undefined, token)).json();
  assertEquals(list.total, 10);
});

Deno.test("pool: the file database is in WAL mode", async () => {
  const { db } = await freshEnv();
  const res = await db.client.execute("PRAGMA journal_mode");
  assertEquals(res.rows[0].journal_mode, "wal");
});
