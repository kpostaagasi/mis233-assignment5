// Kamil Postaağası, 2023501030
import { defineConfig } from "drizzle-kit";

// Drizzle Kit reads schema.ts and writes SQL migration files into ./drizzle.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: "file:./tasks.db" },
});
