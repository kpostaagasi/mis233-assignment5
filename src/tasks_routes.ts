// Kamil Postaağası, 2023501030
import { createRoute } from "@hono/zod-openapi";
import { fail } from "./errors.ts";
import { bearer, body, errors, json, router } from "./openapi.ts";
import {
  IdParam,
  ListQuery,
  OkSchema,
  TaskBody,
  TaskPage,
  TaskSchema,
} from "./validation.ts";
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  restoreTask,
  updateTask,
} from "./tasks_repo.ts";

// Each route is described once: method, path, input schemas and every response. The
// library validates the input with these schemas before the handler runs, and the same
// description goes into /openapi.json.
const tags = ["tasks"];
const NOT_FOUND = "task not found";

const list = createRoute({
  method: "get",
  path: "/",
  tags,
  security: bearer,
  summary: "One page of my tasks, optionally filtered",
  request: { query: ListQuery },
  responses: { 200: json(TaskPage, "One page"), 400: errors[400], 401: errors[401] },
});

const create = createRoute({
  method: "post",
  path: "/",
  tags,
  security: bearer,
  summary: "Create a task",
  request: body(TaskBody),
  responses: { 201: json(TaskSchema, "Created"), 400: errors[400], 401: errors[401] },
});

const read = createRoute({
  method: "get",
  path: "/{id}",
  tags,
  security: bearer,
  summary: "One of my tasks",
  request: { params: IdParam },
  responses: {
    200: json(TaskSchema, "The task"),
    400: errors[400],
    401: errors[401],
    404: errors[404],
  },
});

const replace = createRoute({
  method: "put",
  path: "/{id}",
  tags,
  security: bearer,
  summary: "Replace one of my tasks",
  request: { params: IdParam, ...body(TaskBody) },
  responses: {
    200: json(TaskSchema, "The updated task"),
    400: errors[400],
    401: errors[401],
    404: errors[404],
  },
});

const remove = createRoute({
  method: "delete",
  path: "/{id}",
  tags,
  security: bearer,
  summary: "Delete one of my tasks (soft delete: it can be restored)",
  request: { params: IdParam },
  responses: {
    200: json(OkSchema, "Deleted"),
    400: errors[400],
    401: errors[401],
    404: errors[404],
  },
});

const restore = createRoute({
  method: "post",
  path: "/{id}/restore",
  tags,
  security: bearer,
  summary: "Restore a deleted task (Bonus 2)",
  request: { params: IdParam },
  responses: {
    200: json(TaskSchema, "Restored"),
    400: errors[400],
    401: errors[401],
    404: errors[404],
  },
});

/**
 * The task routes. requireAuth has already run, so c.get("userId") is set, and each
 * request has borrowed a connection from the pool: c.get("conn").
 */
export function taskRoutes() {
  const r = router();

  r.openapi(list, async (c) => {
    const page = await listTasks(c.get("conn"), c.get("userId"), c.req.valid("query"));
    return c.json(page, 200);
  });

  r.openapi(create, async (c) => {
    const task = await createTask(c.get("conn"), c.get("userId"), c.req.valid("json"));
    return c.json(task, 201);
  });

  r.openapi(read, async (c) => {
    const task = await getTask(c.get("conn"), c.get("userId"), c.req.valid("param").id);
    return task ? c.json(task, 200) : fail(c, 404, NOT_FOUND);
  });

  r.openapi(replace, async (c) => {
    const { id } = c.req.valid("param");
    const task = await updateTask(
      c.get("conn"),
      c.get("userId"),
      id,
      c.req.valid("json"),
    );
    return task ? c.json(task, 200) : fail(c, 404, NOT_FOUND);
  });

  r.openapi(remove, async (c) => {
    const deleted = await deleteTask(
      c.get("conn"),
      c.get("userId"),
      c.req.valid("param").id,
    );
    return deleted ? c.json({ ok: true as const }, 200) : fail(c, 404, NOT_FOUND);
  });

  r.openapi(restore, async (c) => {
    const task = await restoreTask(
      c.get("conn"),
      c.get("userId"),
      c.req.valid("param").id,
    );
    return task ? c.json(task, 200) : fail(c, 404, "no deleted task with this id");
  });

  return r;
}
