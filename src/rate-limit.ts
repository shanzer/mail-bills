export interface FailedAuthLimiterOptions {
  maxFailures?: number;
  windowMs?: number;
  blockMs?: number;
  maxEntries?: number;
  now?: () => number;
}

interface Entry {
  count: number;
  windowStart: number;
  blockedUntil?: number;
}

/**
 * In-memory per-IP failed-auth backoff. After maxFailures failures inside
 * windowMs, the IP is blocked for blockMs. Success clears the IP. The map is
 * pruned (and, at worst, cleared — fail open, never OOM) at maxEntries.
 */
export class FailedAuthLimiter {
  private readonly entries = new Map<string, Entry>();
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private readonly blockMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(options: FailedAuthLimiterOptions = {}) {
    this.maxFailures = options.maxFailures ?? 5;
    this.windowMs = options.windowMs ?? 60_000;
    this.blockMs = options.blockMs ?? 5 * 60_000;
    this.maxEntries = options.maxEntries ?? 10_000;
    this.now = options.now ?? Date.now;
  }

  isBlocked(ip: string): boolean {
    const entry = this.entries.get(ip);
    if (!entry?.blockedUntil) return false;
    if (entry.blockedUntil <= this.now()) {
      this.entries.delete(ip);
      return false;
    }
    return true;
  }

  recordFailure(ip: string): void {
    const now = this.now();
    if (this.entries.size >= this.maxEntries && !this.entries.has(ip)) this.prune(now);
    const entry = this.entries.get(ip);
    if (!entry || now - entry.windowStart > this.windowMs) {
      this.entries.set(ip, { count: 1, windowStart: now });
      return;
    }
    entry.count += 1;
    if (entry.count >= this.maxFailures) entry.blockedUntil = now + this.blockMs;
  }

  recordSuccess(ip: string): void {
    this.entries.delete(ip);
  }

  private prune(now: number): void {
    for (const [ip, entry] of this.entries) {
      const expired = entry.blockedUntil ? entry.blockedUntil <= now : now - entry.windowStart > this.windowMs;
      if (expired) this.entries.delete(ip);
    }
    if (this.entries.size >= this.maxEntries) this.entries.clear();
  }
}
