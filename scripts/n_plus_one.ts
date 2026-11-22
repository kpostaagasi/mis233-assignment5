// Kamil Postaağası, 2023501030
// Bonus 3: count the queries of the naive and the good versions.
// Run: deno run -A scripts/n_plus_one.ts
import { createDb, migrate } from "../src/db.ts";
import { tasks, users } from "../src/schema.ts";
import {
  summary,
  summaryNaive,
  usersOverview,
  usersOverviewNaive,
} from "../src/summary.ts";
import { countingDb } from "./query_counter.ts";

const file = await Deno.makeTempFile({ suffix: ".db" });
const db = createDb(`file:${file}`);
await migrate(db);

// 10 users with 0..9 tasks each
for (let u = 1; u <= 10; u++) {
  const [user] = await db.db.insert(users)
    .values({ email: `user${u}@example.com`, passwordHash: "x" }).returning();
  const statuses = ["todo", "in-progress", "done"] as const;
  for (let i = 0; i < u - 1; i++) {
    await db.db.insert(tasks).values({
      userId: user.id,
      title: `t${i}`,
      status: statuses[i % 3],
    });
  }
}

async function run(
  name: string,
  fn: (d: ReturnType<typeof countingDb>["db"]) => Promise<unknown>,
) {
  console.log(`\n== ${name}`);
  const { db: logged, counter } = countingDb(db.client, true);
  const result = await fn(logged);
  console.log(
    `  -> ${counter.queries.length} queries, result: ${JSON.stringify(result)}`,
  );
}

await run("summaryNaive (user 10)", (d) => summaryNaive(d, 10));
await run("summary, GROUP BY (user 10)", (d) => summary(d, 10));
await run(
  "usersOverviewNaive (10 users)",
  async (d) => (await usersOverviewNaive(d)).length,
);
await run(
  "usersOverview, LEFT JOIN (10 users)",
  async (d) => (await usersOverview(d)).length,
);
