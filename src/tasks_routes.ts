// Kamil Postaağası, 2023501030
import { Hono } from "hono";
import type { Env } from "./types.ts";
import { fail, toIssues } from "./errors.ts";
import { IdParam, ListQuery, TaskBody } from "./validation.ts";
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  restoreTask,
  updateTask,
} from "./tasks_repo.ts";

/**
 * The task routes. requireAuth has already run, so c.get("userId") is set, and each
 * request has borrowed a connection from the pool: c.get("conn").
 */
export function taskRoutes() {
  const r = new Hono<Env>();

  r.get("/", async (c) => {
    const q = ListQuery.safeParse(c.req.query());
    if (!q.success) return fail(c, 400, "validation failed", toIssues(q.error.issues));
    return c.json(await listTasks(c.get("conn"), c.get("userId"), q.data));
  });

  r.post("/", async (c) => {
    const body = TaskBody.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) {
      return fail(c, 400, "validation failed", toIssues(body.error.issues));
    }
    return c.json(await createTask(c.get("conn"), c.get("userId"), body.data), 201);
  });

  r.get("/:id", async (c) => {
    const p = IdParam.safeParse(c.req.param());
    if (!p.success) return fail(c, 400, "validation failed", toIssues(p.error.issues));
    const task = await getTask(c.get("conn"), c.get("userId"), p.data.id);
    return task ? c.json(task) : fail(c, 404, "task not found");
  });

  r.put("/:id", async (c) => {
    const p = IdParam.safeParse(c.req.param());
    if (!p.success) return fail(c, 400, "validation failed", toIssues(p.error.issues));
    const body = TaskBody.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) {
      return fail(c, 400, "validation failed", toIssues(body.error.issues));
    }
    const task = await updateTask(c.get("conn"), c.get("userId"), p.data.id, body.data);
    return task ? c.json(task) : fail(c, 404, "task not found");
  });

  r.delete("/:id", async (c) => {
    const p = IdParam.safeParse(c.req.param());
    if (!p.success) return fail(c, 400, "validation failed", toIssues(p.error.issues));
    const deleted = await deleteTask(c.get("conn"), c.get("userId"), p.data.id);
    return deleted ? c.json({ ok: true }) : fail(c, 404, "task not found");
  });

  r.post("/:id/restore", async (c) => {
    const p = IdParam.safeParse(c.req.param());
    if (!p.success) return fail(c, 400, "validation failed", toIssues(p.error.issues));
    const task = await restoreTask(c.get("conn"), c.get("userId"), p.data.id);
    return task ? c.json(task) : fail(c, 404, "no deleted task with this id");
  });

  return r;
}
