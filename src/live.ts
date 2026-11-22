// Kamil Postaağası, 2023501030
import type { Task } from "./schema.ts";

/** What a browser receives over the WebSocket after a change. */
export type LiveEvent =
  | { type: "created" | "updated" | "restored"; task: Task }
  | { type: "deleted"; task: { id: number } };

/** The two things the hub needs from a socket; a real WebSocket has both. */
export type SocketLike = { readonly readyState: number; send(data: string): void };

const OPEN = 1; // WebSocket.OPEN

/**
 * Bonus 13: user id -> that user's open sockets (one per tab). An event goes to the
 * sockets of the task's owner only, never to everyone.
 */
export class LiveHub {
  #byUser = new Map<number, Set<SocketLike>>();

  add(userId: number, socket: SocketLike) {
    const set = this.#byUser.get(userId) ?? new Set();
    set.add(socket);
    this.#byUser.set(userId, set);
  }

  remove(userId: number, socket: SocketLike) {
    const set = this.#byUser.get(userId);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) this.#byUser.delete(userId); // do not keep empty sets forever
  }

  count(userId: number) {
    return this.#byUser.get(userId)?.size ?? 0;
  }

  publish(userId: number, event: LiveEvent) {
    const message = JSON.stringify(event);
    for (const socket of this.#byUser.get(userId) ?? []) {
      if (socket.readyState === OPEN) socket.send(message);
    }
  }
}
