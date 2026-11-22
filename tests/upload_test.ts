// Kamil Postaağası, 2023501030
import { assertEquals, assertMatch } from "@std/assert";
import { freshEnv, login, send } from "./helpers.ts";

// The 8 bytes every PNG starts with, then a little filler.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

async function setup() {
  const env = await freshEnv();
  const token = await login(env.app);
  const task = await (await send(env.app, "POST", "/api/tasks", { title: "pic" }, token))
    .json();
  const upload = (file: unknown, who = token, id = task.id) => {
    const form = new FormData();
    if (file instanceof File) form.append("file", file);
    else if (typeof file === "string") form.append("file", file);
    return env.app.request(`/api/tasks/${id}/attachment`, {
      method: "POST",
      headers: { authorization: `Bearer ${who}` },
      body: form,
    });
  };
  return { ...env, token, task, upload };
}

Deno.test("upload a PNG (201) and download the same bytes with the right type", async () => {
  const { app, token, task, upload, config } = await setup();
  const res = await upload(
    new File([PNG], "../../etc/passwd.png", { type: "image/png" }),
  );
  assertEquals(res.status, 201);
  const updated = await res.json();
  assertMatch(updated.attachment, /^[0-9a-f-]{36}\.png$/); // our name, not the user's
  const files = [...Deno.readDirSync(config.UPLOAD_DIR)].map((f) => f.name);
  assertEquals(files, [updated.attachment]);

  const down = await send(
    app,
    "GET",
    `/api/tasks/${task.id}/attachment`,
    undefined,
    token,
  );
  assertEquals(down.status, 200);
  assertEquals(down.headers.get("content-type"), "image/png");
  assertEquals(new Uint8Array(await down.arrayBuffer()), PNG);
});

Deno.test("no file is 400", async () => {
  const { upload } = await setup();
  const res = await upload("just text");
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, 'file required (form field "file")');
});

Deno.test("a file over 1 MB is 413", async () => {
  const { upload } = await setup();
  const big = new Uint8Array(1_000_001);
  big.set(PNG);
  const res = await upload(new File([big], "big.png", { type: "image/png" }));
  assertEquals(res.status, 413);
  assertEquals((await res.json()).error, "file too large (max 1 MB)");
});

Deno.test("a wrong type is 415, also a text file that claims to be a PNG", async () => {
  const { upload } = await setup();
  const gif = await upload(new File(["GIF89a"], "a.gif", { type: "image/gif" }));
  assertEquals(gif.status, 415);
  const fake = await upload(new File(["hello"], "a.png", { type: "image/png" }));
  assertEquals(fake.status, 415);
});

Deno.test("only the owner can upload or download", async () => {
  const { app, task, upload } = await setup();
  await upload(new File([PNG], "a.png", { type: "image/png" }));
  const other = await login(app, "other@example.com");
  const up = await upload(new File([PNG], "b.png", { type: "image/png" }), other);
  const down = await send(
    app,
    "GET",
    `/api/tasks/${task.id}/attachment`,
    undefined,
    other,
  );
  assertEquals([up.status, down.status], [404, 404]);
});

Deno.test("a new upload replaces the old file; no attachment yet is 404", async () => {
  const { app, token, task, upload, config } = await setup();
  const none = await send(
    app,
    "GET",
    `/api/tasks/${task.id}/attachment`,
    undefined,
    token,
  );
  assertEquals(none.status, 404);
  await upload(new File([PNG], "a.png", { type: "image/png" }));
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
  const second = await (await upload(new File([jpg], "b.jpg", { type: "image/jpeg" })))
    .json();
  const files = [...Deno.readDirSync(config.UPLOAD_DIR)].map((f) => f.name);
  assertEquals(files, [second.attachment]);
});
