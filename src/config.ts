// Kamil Postaağası, 2023501030
import { z } from "zod";

/** The default secret is fine on a laptop and refused in production. */
export const DEV_SECRET = "dev-secret";

/**
 * Every setting the app reads from the environment, in one place, checked once at start-up.
 * Nothing else in src/ calls Deno.env.get.
 */
const ConfigSchema = z.object({
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8000),
  DATABASE_URL: z.string()
    .regex(/^(file|libsql|https?):/, "must start with file:, libsql: or https:")
    .default("file:./tasks.db"),
  // Only for a hosted libSQL database such as Turso (Bonus 19).
  DATABASE_AUTH_TOKEN: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(1).default(DEV_SECRET),
  // Bonus 7: "jwt" signs tokens; "session" keeps the given sessions table. Same routes.
  AUTH_MODE: z.enum(["jwt", "session"]).default("jwt"),
  // Bonus 9: this user is made an admin at start-up (if the account exists).
  ADMIN_EMAIL: z.email().optional(),
  // Bonus 6: how many connections the request pool opens.
  // Bonus 12: where uploaded images are stored (kept out of Git).
  UPLOAD_DIR: z.string().min(1).default("./uploads"),
  // Bonus 14: when the purge job runs (cron syntax, UTC). "* * * * *" = every minute.
  PURGE_CRON: z.string().min(9).default("0 3 * * *"),
  // Bonus 16: where Deno KV keeps its file. Empty = Deno's default place (and the managed
  // store on Deno Deploy).
  KV_PATH: z.string().min(1).optional(),
  DB_POOL_SIZE: z.coerce.number().int().min(1).max(32).default(4),
}).superRefine((c, ctx) => {
  if (c.APP_ENV !== "production") return;
  if (c.JWT_SECRET === DEV_SECRET || c.JWT_SECRET === "change-me") {
    ctx.addIssue({
      code: "custom",
      path: ["JWT_SECRET"],
      message: "the default secret is not allowed in production",
    });
  } else if (c.JWT_SECRET.length < 32) {
    ctx.addIssue({
      code: "custom",
      path: ["JWT_SECRET"],
      message: "use at least 32 characters in production",
    });
  }
});

export type Config = z.infer<typeof ConfigSchema>;

export class ConfigError extends Error {}

/**
 * Read and validate the settings. Empty strings count as "not set", so a blank line in
 * a .env file falls back to the default instead of failing in a confusing way.
 */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ""));
  const parsed = ConfigSchema.safeParse(cleaned);
  if (parsed.success) return parsed.data;
  const lines = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
  throw new ConfigError(`Invalid configuration:\n${lines.join("\n")}`);
}

/** Settings for tests and for code that does not care: all defaults, APP_ENV=test. */
export const testConfig = (overrides: Record<string, string> = {}): Config =>
  loadConfig({ APP_ENV: "test", ...overrides });
