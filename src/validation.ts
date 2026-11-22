// Kamil Postaağası, 2023501030
// Every Zod schema of the API. The routes validate with them, and the same schemas build
// /openapi.json (Bonus 8), so the documentation cannot drift away from the checks.
import { z } from "@hono/zod-openapi";
import { PRIORITIES, ROLES, STATUSES } from "./schema.ts";

const Status = z.enum(STATUSES).openapi({ example: "todo" });
const Priority = z.enum(PRIORITIES).openapi({ example: "medium" });

// ------------------------------------------------------------------ request schemas

/** Register and login share one body: a valid email and a password of 8+ characters. */
export const Credentials = z.object({
  email: z.email().trim().toLowerCase().openapi({ example: "ayse@example.com" }),
  password: z.string().min(8, "password must have at least 8 characters").max(72)
    .openapi({ example: "secret123" }),
}).openapi("Credentials");

/** POST and PUT on a task share this body. PUT replaces the whole task. */
export const TaskBody = z.object({
  title: z.string().trim().min(1, "title is required").max(100)
    .openapi({ example: "Study for the midterm" }),
  status: Status.default("todo"),
  priority: Priority.default("medium"),
  dueDate: z.iso.date().nullable().default(null).openapi({ example: "2026-12-04" }),
}).openapi("TaskBody");

/** The query string of GET /api/tasks. Text like "3" becomes the number 3. */
export const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1).openapi({ example: 1 }),
  limit: z.coerce.number().int().min(1).max(100).default(20).openapi({ example: 20 }),
  status: Status.optional(),
  priority: Priority.optional(),
  deleted: z.stringbool().default(false).openapi({
    description: "true lists the soft-deleted tasks (the trash)",
    example: false,
  }),
});

/** The :id in the URL: a positive whole number, or the request is a 400. */
export const IdParam = z.object({
  id: z.coerce.number().int().positive().openapi({
    param: { name: "id", in: "path" },
    example: 1,
  }),
});

// ------------------------------------------------------------------ response schemas

export const ErrorSchema = z.object({
  error: z.string().openapi({ example: "validation failed" }),
  issues: z.array(z.object({
    path: z.array(z.union([z.string(), z.number()])),
    message: z.string(),
  })).optional(),
  requestId: z.string().optional(),
}).openapi("Error");

export const TaskSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  title: z.string(),
  status: Status,
  priority: Priority,
  createdAt: z.number().int().openapi({ description: "Unix seconds" }),
  dueDate: z.string().nullable(),
  deletedAt: z.number().int().nullable(),
  attachment: z.string().nullable(),
}).openapi("Task");

export const TaskPage = z.object({
  items: z.array(TaskSchema),
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
}).openapi("TaskPage");

export const UserSchema = z.object({
  id: z.number().int(),
  email: z.string(),
  role: z.enum(ROLES),
}).openapi("User");

export const UserOverviewSchema = UserSchema.extend({ tasks: z.number().int() })
  .openapi("UserOverview");

export const SummarySchema = z.object({
  "todo": z.number().int(),
  "in-progress": z.number().int(),
  "done": z.number().int(),
  total: z.number().int(),
}).openapi("Summary");

export const TokenSchema = z.object({ token: z.string() }).openapi("Token");
export const OkSchema = z.object({ ok: z.literal(true) });
