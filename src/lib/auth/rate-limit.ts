/**
 * A small in-memory fixed-window limiter for sign-in and sign-up attempts.
 * It is per server process, which suits the single-instance JSON-file setup;
 * a multi-instance deployment should move this to a shared store.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Records an attempt for `key`; returns false once the limit for the current window is used up. */
  attempt(key: string, now = Date.now()): boolean {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (this.hits.size > 10_000) this.prune(now);
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= this.limit;
  }

  /** Clears the counter for `key`, e.g. after a successful sign-in. */
  reset(key: string): void {
    this.hits.delete(key);
  }

  /** Drops expired windows so the map can't grow without bound. */
  private prune(now: number): void {
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }
}

/** Best-effort client IP for rate limiting (first hop of X-Forwarded-For). */
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}
