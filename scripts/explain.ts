// Kamil Postaağası, 2023501030
// Bonus 4: the query plan and the time of a list query, without and with the index.
// Run: deno run -A scripts/explain.ts
import { createDb, migrate } from "../src/db.ts";
import { tasks, users } from "../src/schema.ts";

const file = await Deno.makeTempFile({ suffix: ".db" });
const db = createDb(`file:${file}`);
await migrate(db);
await db.client.execute("DROP INDEX idx_tasks_user_status"); // start without it

// 20 users with 1,000 tasks each = 20,000 rows, inserted in batches of 500
const statuses = ["todo", "in-progress", "done"] as const;
for (let u = 1; u <= 20; u++) {
  await db.db.insert(users).values({ email: `bulk${u}@example.com`, passwordHash: "x" });
  for (let b = 0; b < 2; b++) {
    const rows = Array.from({ length: 500 }, (_, i) => ({
      userId: u,
      title: `task ${b * 500 + i}`,
      status: statuses[i % 3],
    }));
    await db.db.insert(tasks).values(rows);
  }
}

// The rows of one filter, and the total that GET /api/tasks?status=done also needs.
const QUERIES = {
  rows: "SELECT * FROM tasks WHERE user_id = ? AND status = ?",
  total: "SELECT count(*) FROM tasks WHERE user_id = ? AND status = ?",
};

async function plan(sql: string) {
  const res = await db.client.execute({
    sql: `EXPLAIN QUERY PLAN ${sql}`,
    args: [7, "done"],
  });
  return res.rows.map((r) => String(r.detail)).join(" | ");
}

/** Average over 200 runs, so one slow run does not decide. */
async function time(sql: string) {
  const runs = 200;
  const start = performance.now();
  for (let i = 0; i < runs; i++) {
    await db.client.execute({ sql, args: [(i % 20) + 1, "done"] });
  }
  return ((performance.now() - start) / runs).toFixed(3);
}

async function report(label: string) {
  for (const [name, sql] of Object.entries(QUERIES)) {
    console.log(`${label} ${name.padEnd(5)}: ${await plan(sql)}`);
    console.log(`${label} ${name.padEnd(5)}: ${await time(sql)} ms per query`);
  }
}

const [{ n }] = (await db.client.execute("SELECT count(*) AS n FROM tasks")).rows;
console.log(`rows in tasks: ${n}`);
await report("before");
await db.client.execute("CREATE INDEX idx_tasks_user_status ON tasks(user_id, status)");
await report("after ");
