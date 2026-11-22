// Kamil Postaağası, 2023501030
import { and, count, eq, type SQL } from "drizzle-orm";
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
};

/**
 * The one rule of this file: every query includes the owner. Then another user's task can
 * never leak by mistake. All values go in through Drizzle's operators, so they are sent as
 * parameters, never glued into the SQL text.
 */
const own = (id: number, userId: number) =>
  and(eq(tasks.id, id), eq(tasks.userId, userId));

export async function listTasks(db: Db, userId: number, o: ListOptions) {
  const filters: SQL[] = [eq(tasks.userId, userId)];
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
  const [task] = await db.db.select().from(tasks).where(own(id, userId));
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

export async function updateTask(db: Db, userId: number, id: number, input: TaskInput) {
  const [task] = await db.db.update(tasks).set(input).where(own(id, userId)).returning();
  return task as Task | undefined;
}

export async function deleteTask(db: Db, userId: number, id: number): Promise<boolean> {
  const rows = await db.db.delete(tasks).where(own(id, userId)).returning({
    id: tasks.id,
  });
  return rows.length > 0;
}
