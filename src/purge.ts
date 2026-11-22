// Kamil Postaağası, 2023501030
import { and, eq, lte } from "drizzle-orm";
import type { Conn } from "./db.ts";
import { tasks } from "./schema.ts";
import { removeUpload } from "./uploads.ts";

const DAY = 24 * 60 * 60;

/**
 * Bonus 14: delete (for real, not soft) the tasks that were done more than `days` days ago.
 * Idempotent: a second run finds nothing left to delete and changes nothing.
 * Returns how many rows were removed. Their image files are removed too.
 */
export async function purgeOldDone(
  db: Conn,
  days: number,
  uploadDir?: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<number> {
  const cutoff = nowSeconds - days * DAY;
  const removed = await db.db.delete(tasks)
    .where(and(eq(tasks.status, "done"), lte(tasks.completedAt, cutoff)))
    .returning({ id: tasks.id, attachment: tasks.attachment });
  if (uploadDir) {
    for (const { attachment } of removed) await removeUpload(uploadDir, attachment);
  }
  return removed.length;
}
