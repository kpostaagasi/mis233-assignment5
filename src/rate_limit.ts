// Kamil Postaağası, 2023501030

/**
 * Bonus 15: at most `max` failed logins per key (the email) in a window of `windowMs`.
 * Kept in memory, so it is per process and forgets everything on a restart.
 */
export class LoginLimiter {
  #fails = new Map<string, { n: number; resetAt: number }>();

  constructor(
    private max = 5,
    private windowMs = 60_000,
    private now: () => number = Date.now, // tests pass a fake clock
  ) {}

  /** Seconds until the key may try again, or 0 when it may try now. */
  retryAfter(key: string): number {
    const e = this.#fails.get(key);
    if (!e || e.resetAt <= this.now()) return 0;
    return e.n >= this.max ? Math.ceil((e.resetAt - this.now()) / 1000) : 0;
  }

  /** Count one failure. An old window starts again from 1. */
  fail(key: string) {
    const e = this.#fails.get(key);
    if (!e || e.resetAt <= this.now()) {
      this.#fails.set(key, { n: 1, resetAt: this.now() + this.windowMs });
    } else e.n++;
  }

  /** A successful login clears the counter. */
  clear(key: string) {
    this.#fails.delete(key);
  }
}
