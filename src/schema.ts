// Kamil Postaağası, 2023501030
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const STATUSES = ["todo", "in-progress", "done"] as const;
export const PRIORITIES = ["low", "medium", "high"] as const;
export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];

// The users table (given).
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
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
});

export type Task = typeof tasks.$inferSelect;
