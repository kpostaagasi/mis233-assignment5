// Kamil Postaağası, 2023501030
import { createApp } from "./app.ts";
import { ConfigError, loadConfig } from "./config.ts";
import { createDb, migrate } from "./db.ts";
import { promoteAdmin } from "./users_repo.ts";
import { purgeOldDone } from "./purge.ts";

// Read the whole configuration once. A missing or wrong value stops here, with a message.
let config;
try {
  config = loadConfig(Deno.env.toObject());
} catch (e) {
  if (!(e instanceof ConfigError)) throw e;
  console.error(e.message);
  Deno.exit(1);
}

const db = createDb(config.DATABASE_URL, config.DATABASE_AUTH_TOKEN, config.DB_POOL_SIZE);
await migrate(db);
if (config.ADMIN_EMAIL && await promoteAdmin(db, config.ADMIN_EMAIL)) {
  console.log(JSON.stringify({ event: "admin promoted", email: config.ADMIN_EMAIL }));
}

// Deno KV for the read cache (Bonus 16): a local file here, a managed store on Deno Deploy.
const kv = await Deno.openKv(config.KV_PATH);

Deno.serve({ port: config.PORT }, createApp(db, { config, kv }).fetch);

// Bonus 14: once a day (03:00 UTC by default) remove tasks done more than 30 days ago.
// Deno.cron needs --unstable-cron locally (it is in the tasks); Deno Deploy runs it itself.
Deno.cron("purge old done tasks", config.PURGE_CRON, async () => {
  const removed = await purgeOldDone(db, 30, config.UPLOAD_DIR);
  console.log(JSON.stringify({ time: new Date().toISOString(), job: "purge", removed }));
});
