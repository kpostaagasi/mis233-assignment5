// Kamil Postaağası, 2023501030
import { createRoute } from "@hono/zod-openapi";
import { bodyLimit } from "hono/body-limit";
import { join } from "@std/path";
import type { TaskCache } from "./cache.ts";
import { fail, toIssues } from "./errors.ts";
import {
  checkUpload,
  contentTypeOf,
  MAX_BYTES,
  removeUpload,
  saveUpload,
} from "./uploads.ts";
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
  setAttachment,
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
export type TaskDeps = {
  cache?: TaskCache; // Bonus 16; without it every read goes to the database
  uploadDir: string; // Bonus 12
};

export function taskRoutes({ cache, uploadDir }: TaskDeps) {
  const r = router();
  /** After any change the cached copy must go, or a reader would see the old task. */
  const changed = (userId: number, id: number) => cache?.invalidate(userId, id);

  r.openapi(list, async (c) => {
    const page = await listTasks(c.get("conn"), c.get("userId"), c.req.valid("query"));
    return c.json(page, 200);
  });

  r.openapi(create, async (c) => {
    const task = await createTask(c.get("conn"), c.get("userId"), c.req.valid("json"));
    return c.json(task, 201);
  });

  r.openapi(read, async (c) => {
    const { id } = c.req.valid("param");
    const userId = c.get("userId");
    const load = () => getTask(c.get("conn"), userId, id);
    const { task, hit } = cache
      ? await cache.getOrLoad(userId, id, load)
      : { task: await load(), hit: false };
    c.header("x-cache", hit ? "hit" : "miss");
    return task ? c.json(task, 200) : fail(c, 404, NOT_FOUND);
  });

  r.openapi(replace, async (c) => {
    const { id } = c.req.valid("param");
    const userId = c.get("userId");
    const task = await updateTask(c.get("conn"), userId, id, c.req.valid("json"));
    if (!task) return fail(c, 404, NOT_FOUND);
    await changed(userId, id);
    return c.json(task, 200);
  });

  r.openapi(remove, async (c) => {
    const { id } = c.req.valid("param");
    const userId = c.get("userId");
    const deleted = await deleteTask(c.get("conn"), userId, id);
    if (!deleted) return fail(c, 404, NOT_FOUND);
    await changed(userId, id);
    return c.json({ ok: true as const }, 200);
  });

  r.openapi(restore, async (c) => {
    const { id } = c.req.valid("param");
    const userId = c.get("userId");
    const task = await restoreTask(c.get("conn"), userId, id);
    if (!task) return fail(c, 404, "no deleted task with this id");
    await changed(userId, id);
    return c.json(task, 200);
  });

  // ---------------------------------------------------------------- Bonus 12: attachment
  // A multipart body is checked by hand (400, 413 and 415 need their own answers), so
  // these two routes are plain Hono routes, documented with registerPath below.

  // Refuse a huge body before reading it into memory; the file check below is exact.
  const limit = bodyLimit({
    maxSize: MAX_BYTES + 64 * 1024, // room for the multipart headers around the file
    onError: (c) => fail(c, 413, "file too large (max 1 MB)"),
  });

  r.post("/:id/attachment", limit, async (c) => {
    const p = IdParam.safeParse(c.req.param());
    if (!p.success) return fail(c, 400, "validation failed", toIssues(p.error.issues));
    const { id } = p.data;
    const userId = c.get("userId");
    const before = await getTask(c.get("conn"), userId, id);
    if (!before) return fail(c, 404, NOT_FOUND);

    const form: Record<string, unknown> = await c.req.parseBody().catch(() => ({}));
    const check = await checkUpload(form["file"]);
    if (!check.ok) return fail(c, check.status, check.error);

    const name = await saveUpload(uploadDir, check.file, check.mime);
    const task = await setAttachment(c.get("conn"), userId, id, name);
    if (!task) { // deleted while we were saving: do not leave the file behind
      await removeUpload(uploadDir, name);
      return fail(c, 404, NOT_FOUND);
    }
    await removeUpload(uploadDir, before.attachment); // a new upload replaces the old one
    await changed(userId, id);
    return c.json(task, 201);
  });

  r.get("/:id/attachment", async (c) => {
    const p = IdParam.safeParse(c.req.param());
    if (!p.success) return fail(c, 400, "validation failed", toIssues(p.error.issues));
    const task = await getTask(c.get("conn"), c.get("userId"), p.data.id);
    if (!task) return fail(c, 404, NOT_FOUND);
    if (!task.attachment) return fail(c, 404, "this task has no attachment");
    const bytes = await Deno.readFile(join(uploadDir, task.attachment)).catch(() => null);
    if (!bytes) return fail(c, 404, "attachment file is missing");
    return c.body(bytes, 200, {
      "content-type": contentTypeOf(task.attachment),
      "content-disposition": `inline; filename="task-${task.id}-${task.attachment}"`,
      "x-content-type-options": "nosniff",
    });
  });

  r.openAPIRegistry.registerPath({
    method: "post",
    path: "/{id}/attachment",
    tags,
    security: bearer,
    summary: "Attach a PNG or JPEG of at most 1 MB (Bonus 12)",
    request: {
      params: IdParam,
      body: {
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              properties: { file: { type: "string", format: "binary" } },
              required: ["file"],
            },
          },
        },
      },
    },
    responses: {
      201: json(TaskSchema, "The task with its attachment name"),
      400: errors[400],
      401: errors[401],
      404: errors[404],
      413: errors[413],
      415: errors[415],
    },
  });

  r.openAPIRegistry.registerPath({
    method: "get",
    path: "/{id}/attachment",
    tags,
    security: bearer,
    summary: "Download the attachment (owner only)",
    request: { params: IdParam },
    responses: {
      200: {
        description: "The image",
        content: {
          "image/png": { schema: { type: "string", format: "binary" } },
          "image/jpeg": { schema: { type: "string", format: "binary" } },
        },
      },
      401: errors[401],
      404: errors[404],
    },
  });

  return r;
}
