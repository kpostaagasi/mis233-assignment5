// Kamil Postaağası, 2023501030
import { and, count, eq, isNotNull, isNull, type SQL, sql } from "drizzle-orm";
import type { Db } from "./db.ts";
import { type Priority, type Status, type Task, tasks } from "./schema.ts";

export type TaskInput = {
  title: string;
  status: Status;
  priority: Priority;
  dueDate: string | null;
};

export type ListOptions = {
  page: number;
  limit: number;
  status?: Status;
  priority?: Priority;
  deleted?: boolean; // true lists the trash instead of the live tasks (Bonus 2)
};

/**
 * The one rule of this file: every query includes the owner. Then another user's task can
 * never leak by mistake. All values go in through Drizzle's operators, so they are sent as
 * parameters, never glued into the SQL text.
 */
const own = (id: number, userId: number) =>
  and(eq(tasks.id, id), eq(tasks.userId, userId));

/** A live task: owned by the user and not soft-deleted (Bonus 2). */
const alive = (id: number, userId: number) =>
  and(own(id, userId), isNull(tasks.deletedAt));

const now = sql`(strftime('%s','now'))`;

export async function listTasks(db: Db, userId: number, o: ListOptions) {
  const filters: SQL[] = [
    eq(tasks.userId, userId),
    o.deleted ? isNotNull(tasks.deletedAt) : isNull(tasks.deletedAt),
  ];
  if (o.status) filters.push(eq(tasks.status, o.status));
  if (o.priority) filters.push(eq(tasks.priority, o.priority));
  const where = and(...filters);

  const items = await db.db.select().from(tasks).where(where)
    .orderBy(tasks.id).limit(o.limit).offset((o.page - 1) * o.limit);
  const [{ total }] = await db.db.select({ total: count() }).from(tasks).where(where);
  return { items, page: o.page, limit: o.limit, total };
}

export async function getTask(
  db: Db,
  userId: number,
  id: number,
): Promise<Task | undefined> {
  const [task] = await db.db.select().from(tasks).where(alive(id, userId));
  return task;
}

export async function createTask(
  db: Db,
  userId: number,
  input: TaskInput,
): Promise<Task> {
  const [task] = await db.db.insert(tasks).values({ ...input, userId }).returning();
  return task;
}

/** PUT replaces the editable fields. .returning() tells us whether a row matched. */
export async function updateTask(db: Db, userId: number, id: number, input: TaskInput) {
  const [task] = await db.db.update(tasks).set(input).where(alive(id, userId))
    .returning();
  return task as Task | undefined;
}

/** Soft delete: mark the row instead of removing it, so it can be restored. */
export async function deleteTask(db: Db, userId: number, id: number): Promise<boolean> {
  const rows = await db.db.update(tasks).set({ deletedAt: now })
    .where(alive(id, userId)).returning({ id: tasks.id });
  return rows.length > 0;
}

/** Undo a soft delete. Only a deleted task can be restored; otherwise undefined. */
export async function restoreTask(db: Db, userId: number, id: number) {
  const [task] = await db.db.update(tasks).set({ deletedAt: null })
    .where(and(own(id, userId), isNotNull(tasks.deletedAt))).returning();
  return task as Task | undefined;
}
