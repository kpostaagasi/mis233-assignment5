// Kamil Postaağası, 2023501030
import { assertEquals, assertThrows } from "@std/assert";
import { ConfigError, loadConfig } from "../src/config.ts";
import { createDb, migrate } from "../src/db.ts";
import { createApp } from "../src/app.ts";
import { freshApp } from "./helpers.ts";

Deno.test("config: an empty environment gives the development defaults", () => {
  const c = loadConfig({});
  assertEquals([c.APP_ENV, c.PORT, c.DATABASE_URL], [
    "development",
    8000,
    "file:./tasks.db",
  ]);
});

Deno.test("config: a wrong PORT or DATABASE_URL is refused with a clear message", () => {
  const err = assertThrows(
    () => loadConfig({ PORT: "eighty", DATABASE_URL: "mysql://x" }),
    ConfigError,
  );
  assertEquals(err.message.includes("PORT"), true);
  assertEquals(err.message.includes("DATABASE_URL: must start with file:"), true);
});

Deno.test("config: production refuses the default and a short secret", () => {
  assertThrows(
    () => loadConfig({ APP_ENV: "production" }),
    ConfigError,
    "default secret",
  );
  assertThrows(
    () => loadConfig({ APP_ENV: "production", JWT_SECRET: "short" }),
    ConfigError,
    "32 characters",
  );
  const ok = loadConfig({ APP_ENV: "production", JWT_SECRET: "x".repeat(32) });
  assertEquals(ok.APP_ENV, "production");
});

Deno.test("GET /healthz is 200 while the process runs", async () => {
  const app = await freshApp();
  const res = await app.request("/healthz");
  assertEquals(res.status, 200);
  assertEquals((await res.json()).ok, true);
});

Deno.test("GET /readyz is 200 with a database and 503 when the database is gone", async () => {
  const file = await Deno.makeTempFile({ suffix: ".db" });
  const db = createDb(`file:${file}`);
  await migrate(db);
  const app = createApp(db);
  assertEquals((await app.request("/readyz")).status, 200);

  db.client.close(); // simulate a lost database
  const down = await app.request("/readyz");
  assertEquals(down.status, 503);
  assertEquals((await down.json()).error, "database not ready");
});
