// Kamil Postaağası, 2023501030
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { freshApp } from "./helpers.ts";

Deno.test("/openapi.json lists every route with its failures and the Bearer scheme", async () => {
  const app = await freshApp();
  const res = await app.request("/openapi.json");
  assertEquals(res.status, 200);
  const doc = await res.json();
  const paths = doc.paths as Record<string, Record<string, { responses: object }>>;

  const expected: [string, string, string[]][] = [
    ["/auth/register", "post", ["201", "400", "409"]],
    ["/auth/login", "post", ["200", "400", "401", "429"]],
    ["/api/tasks", "get", ["200", "400", "401"]],
    ["/api/tasks", "post", ["201", "400", "401"]],
    ["/api/tasks/{id}", "get", ["200", "400", "401", "404"]],
    ["/api/tasks/{id}", "put", ["200", "400", "401", "404"]],
    ["/api/tasks/{id}", "delete", ["200", "400", "401", "404"]],
    ["/api/admin/users", "get", ["200", "401", "403"]],
  ];
  for (const [path, method, codes] of expected) {
    const op = paths[path]?.[method];
    assert(op, `${method} ${path} is missing`);
    for (const code of codes) {
      assert(code in op.responses, `${method} ${path} lacks ${code}`);
    }
  }
  assertEquals(doc.components.securitySchemes.Bearer.scheme, "bearer");
  // the request body in the docs is the same Zod schema the route validates with
  assertEquals(doc.components.schemas.TaskBody.properties.title.maxLength, 100);
});

Deno.test("/docs serves the Swagger UI page that loads /openapi.json", async () => {
  const app = await freshApp();
  const res = await app.request("/docs");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "swagger-ui");
  assertStringIncludes(html, "/openapi.json");
});
