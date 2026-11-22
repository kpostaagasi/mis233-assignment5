// Kamil Postaağası, 2023501030
import type { Task } from "./schema.ts";

/**
 * Bonus 16: GET /api/tasks/:id answers from Deno KV for 60 seconds. The key contains the
 * user id, so one user can never be served another user's cached task, and every change
 * to a task deletes its entry, so a changed task is never served stale.
 */
export class TaskCache {
  /** How many times the database had to be asked (a miss). Tests read it. */
  dbReads = 0;

  constructor(
    private kv: Deno.Kv,
    private prefix = "task", // tests use a unique prefix per app on one shared KV
    private ttlMs = 60_000,
  ) {}

  key(userId: number, id: number): Deno.KvKey {
    return [this.prefix, userId, id];
  }

  /** A hit returns the stored task; a miss loads it, stores it with an expiry and returns it. */
  async getOrLoad(
    userId: number,
    id: number,
    load: () => Promise<Task | undefined>,
  ): Promise<{ task: Task | undefined; hit: boolean }> {
    const cached = await this.kv.get<Task>(this.key(userId, id));
    if (cached.value) return { task: cached.value, hit: true };
    this.dbReads++;
    const task = await load();
    if (task) await this.kv.set(this.key(userId, id), task, { expireIn: this.ttlMs });
    return { task, hit: false };
  }

  invalidate(userId: number, id: number) {
    return this.kv.delete(this.key(userId, id));
  }
}
