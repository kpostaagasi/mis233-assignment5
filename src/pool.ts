// Kamil Postaağası, 2023501030

/**
 * Bonus 6, option B: a small generic pool. acquire() hands out an idle item or waits in a
 * queue (first come, first served); release() gives the item straight to the next waiter.
 */
export class Pool<T> {
  #idle: T[];
  #waiting: ((item: T) => void)[] = [];
  readonly size: number;

  constructor(items: T[]) {
    if (items.length === 0) throw new Error("a pool needs at least one item");
    this.#idle = [...items];
    this.size = items.length;
  }

  get idle() {
    return this.#idle.length;
  }

  get waiting() {
    return this.#waiting.length;
  }

  acquire(): Promise<T> {
    const item = this.#idle.pop();
    if (item !== undefined) return Promise.resolve(item);
    return new Promise((resolve) => this.#waiting.push(resolve));
  }

  release(item: T) {
    const next = this.#waiting.shift();
    if (next) next(item); // hand it straight to the next waiter
    else this.#idle.push(item);
  }

  /** Borrow an item for the time of fn, and always give it back, even when fn throws. */
  async use<R>(fn: (item: T) => Promise<R>): Promise<R> {
    const item = await this.acquire();
    try {
      return await fn(item);
    } finally {
      this.release(item);
    }
  }
}
