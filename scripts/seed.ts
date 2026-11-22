// Kamil Postaağası, 2023501030
// Bonus 5: fill a fresh database with demo users and tasks. Safe to run twice.
// Run: deno task seed   (uses DATABASE_URL like the app; refuses APP_ENV=production)
import { count, eq, inArray } from "drizzle-orm";
import { hashPassword } from "../src/auth.ts";
import { ConfigError, loadConfig } from "../src/config.ts";
import { createDb, type Db, migrate } from "../src/db.ts";
import { type Priority, type Status, tasks, users } from "../src/schema.ts";

export const DEMO_USERS = [
  { email: "demo@example.com", password: "demo-pass-1", role: "user" },
  { email: "admin@example.com", password: "admin-pass-1", role: "admin" },
] as const;

const TITLES = [
  "Read the Hono docs",
  "Write the tasks table",
  "Hash passwords with bcrypt",
  "Protect /api with requireAuth",
  "Validate bodies with Zod",
  "Add pagination",
  "Write ten tests",
  "Fill in the README",
  "Try the curl examples",
  "Prepare for the MIS 233 midterm",
];

/** Insert the demo data. Returns how many users and tasks were added this time. */
export async function seed(db: Db) {
  const rows = await Promise.all(DEMO_USERS.map(async (u) => ({
    email: u.email,
    role: u.role,
    passwordHash: await hashPassword(u.password),
  })));
  // An email that is already there is skipped, not an error.
  const added = await db.db.insert(users).values(rows).onConflictDoNothing().returning();

  const demo = await db.db.select({ id: users.id }).from(users)
    .where(inArray(users.email, DEMO_USERS.map((u) => u.email)));
  let tasksAdded = 0;
  for (const { id } of demo) {
    const [{ n }] = await db.db.select({ n: count() }).from(tasks).where(
      eq(tasks.userId, id),
    );
    if (n > 0) continue; // this user has tasks already: do not add them again
    const statuses: Status[] = ["todo", "in-progress", "done"];
    const priorities: Priority[] = ["low", "medium", "high"];
    const list = TITLES.map((title, i) => ({
      userId: id,
      title,
      status: statuses[i % 3],
      priority: priorities[(i + 1) % 3],
    }));
    await db.db.insert(tasks).values(list);
    tasksAdded += list.length;
  }
  return { usersAdded: added.length, tasksAdded };
}

if (import.meta.main) {
  try {
    const config = loadConfig(Deno.env.toObject());
    if (config.APP_ENV === "production") {
      console.error("Refusing to seed: APP_ENV is production.");
      Deno.exit(1);
    }
    const db = createDb(config.DATABASE_URL, config.DATABASE_AUTH_TOKEN);
    await migrate(db);
    const result = await seed(db);
    console.log(JSON.stringify({ seeded: config.DATABASE_URL, ...result }));
  } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
    console.error(e.message);
    Deno.exit(1);
  }
}
