// Kamil Postaağası, 2023501030
import type { Db } from "./db.ts";
import { tasks, users } from "./schema.ts";

/** The tx object Drizzle passes into db.transaction(...). */
type Tx = Parameters<Parameters<Db["db"]["transaction"]>[0]>[0];

/** The first task every new user finds in the list. */
export async function addWelcomeTask(tx: Tx, userId: number) {
  await tx.insert(tasks).values({
    userId,
    title: "Welcome! Move me to done when you have seen the API work",
    priority: "low",
  });
}

/**
 * Create the user and the welcome task in one transaction: both rows are written, or
 * neither is. Inside the callback every query uses tx, not db; a query on db would run
 * outside the transaction and would not be rolled back.
 */
export function registerUser(
  db: Db,
  email: string,
  passwordHash: string,
  welcome: ((tx: Tx, userId: number) => Promise<void>) | null = addWelcomeTask,
) {
  return db.db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ email, passwordHash })
      .returning({ id: users.id, email: users.email });
    if (welcome) await welcome(tx, user.id);
    return user;
  });
}
