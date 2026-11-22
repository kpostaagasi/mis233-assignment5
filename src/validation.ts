// Kamil Postaağası, 2023501030
import { z } from "zod";
import { PRIORITIES, STATUSES } from "./schema.ts";

/** Register and login share one body: a valid email and a password of 8+ characters. */
export const Credentials = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8, "password must have at least 8 characters").max(72),
});

const Status = z.enum(STATUSES);
const Priority = z.enum(PRIORITIES);

/** POST and PUT on a task share this body. PUT replaces the whole task. */
export const TaskBody = z.object({
  title: z.string().trim().min(1, "title is required").max(100),
  status: Status.default("todo"),
  priority: Priority.default("medium"),
});

/** The query string of GET /api/tasks. Text like "3" becomes the number 3. */
export const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: Status.optional(),
  priority: Priority.optional(),
});

/** The :id in the URL: a positive whole number, or the request is a 400. */
export const IdParam = z.object({ id: z.coerce.number().int().positive() });
