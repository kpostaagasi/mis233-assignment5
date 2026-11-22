// Kamil Postaağası, 2023501030
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const STATUSES = ["todo", "in-progress", "done"] as const;
export const PRIORITIES = ["low", "medium", "high"] as const;
export const ROLES = ["user", "admin"] as const;
export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Role = (typeof ROLES)[number];

// The users table (given).
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  // Bonus 9: what the user may do. Everyone starts as "user".
  role: text("role", { enum: ROLES }).notNull().default("user"),
  // A SQL default runs for every row. A JavaScript Date.now() here would run once.
  createdAt: integer("created_at").notNull().default(sql`(strftime('%s','now'))`),
});

// The sessions table (given): a login makes a row, a token finds it.
export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  expiresAt: integer("expires_at").notNull(),
});

// A task belongs to exactly one user. Times are Unix seconds, like users.created_at.
export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  status: text("status", { enum: STATUSES }).notNull().default("todo"),
  priority: text("priority", { enum: PRIORITIES }).notNull().default("medium"),
  createdAt: integer("created_at").notNull().default(sql`(strftime('%s','now'))`),
  // Added later with a second migration (Bonus 1): an optional "YYYY-MM-DD" date.
  dueDate: text("due_date"),
  // Soft delete (Bonus 2): NULL while the task is alive, the delete time once removed.
  deletedAt: integer("deleted_at"),
}, (t) => [
  // Bonus 4: the list query filters by owner and status; this index answers it directly.
  index("idx_tasks_user_status").on(t.userId, t.status),
]);

export type Task = typeof tasks.$inferSelect;
