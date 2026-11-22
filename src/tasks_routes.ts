// Kamil Postaağası, 2023501030
import { Hono } from "hono";
import type { Db } from "./db.ts";
import type { Env } from "./types.ts";
import { fail, toIssues } from "./errors.ts";
import { IdParam, ListQuery, TaskBody } from "./validation.ts";
import { createTask, deleteTask, getTask, listTasks, updateTask } from "./tasks_repo.ts";

/** The five task routes. requireAuth has already run, so c.get("userId") is set. */
export function taskRoutes(db: Db) {
  const r = new Hono<Env>();

  r.get("/", async (c) => {
    const q = ListQuery.safeParse(c.req.query());
    if (!q.success) return fail(c, 400, "validation failed", toIssues(q.error.issues));
    return c.json(await listTasks(db, c.get("userId"), q.data));
  });

  r.post("/", async (c) => {
    const body = TaskBody.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) {
      return fail(c, 400, "validation failed", toIssues(body.error.issues));
    }
    return c.json(await createTask(db, c.get("userId"), body.data), 201);
  });

  r.get("/:id", async (c) => {
    const p = IdParam.safeParse(c.req.param());
    if (!p.success) return fail(c, 400, "validation failed", toIssues(p.error.issues));
    const task = await getTask(db, c.get("userId"), p.data.id);
    return task ? c.json(task) : fail(c, 404, "task not found");
  });

  r.put("/:id", async (c) => {
    const p = IdParam.safeParse(c.req.param());
    if (!p.success) return fail(c, 400, "validation failed", toIssues(p.error.issues));
    const body = TaskBody.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) {
      return fail(c, 400, "validation failed", toIssues(body.error.issues));
    }
    const task = await updateTask(db, c.get("userId"), p.data.id, body.data);
    return task ? c.json(task) : fail(c, 404, "task not found");
  });

  r.delete("/:id", async (c) => {
    const p = IdParam.safeParse(c.req.param());
    if (!p.success) return fail(c, 400, "validation failed", toIssues(p.error.issues));
    const deleted = await deleteTask(db, c.get("userId"), p.data.id);
    return deleted ? c.json({ ok: true }) : fail(c, 404, "task not found");
  });

  return r;
}
