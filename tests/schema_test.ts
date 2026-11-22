// Kamil Postaağası, 2023501030
import { assertEquals } from "@std/assert";
import { getTableColumns, getTableName } from "drizzle-orm";
import { createDb, migrate, MIGRATIONS } from "../src/db.ts";
import { tasks, users } from "../src/schema.ts";

async function freshDb() {
  const file = await Deno.makeTempFile({ suffix: ".db" });
  const db = createDb(`file:${file}`);
  await migrate(db);
  return db;
}

Deno.test("a task row goes in through Drizzle and comes back with its defaults", async () => {
  const { db } = await freshDb();
  const [user] = await db.insert(users).values({
    email: "s@example.com",
    passwordHash: "x",
  })
    .returning();
  const [task] = await db.insert(tasks).values({
    userId: user.id,
    title: "Read chapter 5",
  })
    .returning();
  assertEquals(task.status, "todo");
  assertEquals(task.priority, "medium");
  assertEquals(typeof task.createdAt, "number");
});

Deno.test("schema.ts and the SQL in the database have the same columns", async () => {
  const { client } = await freshDb();
  for (const table of [users, tasks]) {
    const res = await client.execute({
      sql: "SELECT name FROM pragma_table_info(?)",
      args: [getTableName(table)],
    });
    const inDb = res.rows.map((r) => String(r.name)).sort();
    const inDrizzle = Object.values(getTableColumns(table)).map((c) => c.name).sort();
    assertEquals(inDb, inDrizzle);
  }
});

Deno.test("migrate() runs every Drizzle Kit file once and can run again safely", async () => {
  const db = await freshDb();
  await migrate(db); // the second time changes nothing and does not throw
  const res = await db.client.execute("SELECT count(*) AS n FROM __drizzle_migrations");
  const files = [...Deno.readDirSync(MIGRATIONS)].filter((f) => f.name.endsWith(".sql"));
  assertEquals(Number(res.rows[0].n), files.length);
});
