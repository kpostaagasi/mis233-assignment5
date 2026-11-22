// Kamil Postaağası, 2023501030
import { createApp } from "./app.ts";
import { ConfigError, loadConfig } from "./config.ts";
import { createDb, migrate } from "./db.ts";

// Read the whole configuration once. A missing or wrong value stops here, with a message.
let config;
try {
  config = loadConfig(Deno.env.toObject());
} catch (e) {
  if (!(e instanceof ConfigError)) throw e;
  console.error(e.message);
  Deno.exit(1);
}

const db = createDb(config.DATABASE_URL, config.DATABASE_AUTH_TOKEN);
await migrate(db);

Deno.serve({ port: config.PORT }, createApp(db, { config }).fetch);
