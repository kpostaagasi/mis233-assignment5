// Kamil Postaağası, 2023501030
import { and, count, eq, isNull } from "drizzle-orm";
import type { Db } from "./db.ts";
import { type Status, STATUSES, tasks, users } from "./schema.ts";

export type Summary = Record<Status, number> & { total: number };

const live = (userId: number) => and(eq(tasks.userId, userId), isNull(tasks.deletedAt));

/** Good: one GROUP BY query, however many tasks there are. Used by GET /api/me/summary. */
export async function summary(db: Db["db"], userId: number): Promise<Summary> {
  const rows = await db.select({ status: tasks.status, n: count() })
    .from(tasks).where(live(userId)).groupBy(tasks.status);
  const result: Summary = { "todo": 0, "in-progress": 0, "done": 0, total: 0 };
  for (const { status, n } of rows) {
    result[status] = n;
    result.total += n;
  }
  return result;
}

/**
 * Naive, kept only to compare (Bonus 3): load the tasks, then one more query per status.
 * That is 1 + 3 queries per call instead of 1, and the first query drags every row of
 * the user over the wire just to count them.
 */
export async function summaryNaive(db: Db["db"], userId: number): Promise<Summary> {
  const all = await db.select().from(tasks).where(live(userId));
  const result: Summary = { "todo": 0, "in-progress": 0, "done": 0, total: all.length };
  for (const status of STATUSES) {
    const [{ n }] = await db.select({ n: count() }).from(tasks)
      .where(and(live(userId), eq(tasks.status, status)));
    result[status] = n;
  }
  return result;
}

export type UserOverview = { id: number; email: string; role: string; tasks: number };

/**
 * The classic N+1, for the admin users list: one query for the users, then one query per
 * user for the task count. 50 users = 51 queries; it grows with the data.
 */
export async function usersOverviewNaive(db: Db["db"]): Promise<UserOverview[]> {
  const list = await db.select({ id: users.id, email: users.email, role: users.role })
    .from(users).orderBy(users.id);
  const result: UserOverview[] = [];
  for (const u of list) {
    const [{ n }] = await db.select({ n: count() }).from(tasks).where(live(u.id));
    result.push({ ...u, tasks: n });
  }
  return result;
}

/** The fix: one LEFT JOIN with GROUP BY. Users without tasks still appear, with 0. */
export function usersOverview(db: Db["db"]): Promise<UserOverview[]> {
  return db.select({
    id: users.id,
    email: users.email,
    role: users.role,
    tasks: count(tasks.id), // count(column) skips the NULLs of the LEFT JOIN
  })
    .from(users)
    .leftJoin(tasks, and(eq(tasks.userId, users.id), isNull(tasks.deletedAt)))
    .groupBy(users.id)
    .orderBy(users.id);
}
