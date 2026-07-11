// Fixed-window in-memory rate limiter.
//
// Scope: per server instance. On Vercel each lambda/regional instance keeps its
// own counters, so a determined distributed attacker can exceed the nominal
// limit by hitting many instances — this is a brute-force speed bump, not a
// hard quota. For a hard guarantee, back it with Redis/Upstash. For this app
// (single admin user, low traffic) the in-memory version removes the
// unlimited-online-brute-force problem at zero infra cost.

interface WindowEntry {
  count: number;
  resetAt: number; // epoch ms when this window expires
}

const windows = new Map<string, WindowEntry>();

// Opportunistic cleanup so the map can't grow unbounded under key churn
// (e.g. attacker rotating emails). Runs at most once per minute.
let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, entry] of windows) {
    if (entry.resetAt <= now) windows.delete(key);
  }
}

export interface RateLimitResult {
  success: boolean;
  /** Seconds until the window resets (only meaningful when success is false). */
  retryAfterSec: number;
}

/**
 * Consume one request from the window identified by `key`.
 * `key` should namespace the endpoint, e.g. `login:alice@example.com`.
 */
export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const entry = windows.get(key);
  if (!entry || entry.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, retryAfterSec: 0 };
  }

  entry.count += 1;
  if (entry.count > limit) {
    return { success: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { success: true, retryAfterSec: 0 };
}
