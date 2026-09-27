// OPEN QUESTION: see PRD 14 — rate limit threshold not yet set.
// Using default 10 requests per minute per user until threshold is confirmed.

interface RateLimitStore {
  timestamps: number[];
}

const rateLimitMap = new Map<string, RateLimitStore>();

// Configurable threshold (default: 10 requests per 60 seconds)
const WINDOW_MS = 60 * 1000;
const DEFAULT_LIMIT = 10;

export function checkRateLimit(
  userId: string,
  limit: number = DEFAULT_LIMIT,
  windowMs: number = WINDOW_MS
): { success: boolean; remaining: number; reset: number } {
  const now = Date.now();
  const windowStart = now - windowMs;

  let userStore = rateLimitMap.get(userId);
  if (!userStore) {
    userStore = { timestamps: [] };
    rateLimitMap.set(userId, userStore);
  }

  // Filter timestamps within the current sliding window
  userStore.timestamps = userStore.timestamps.filter((ts) => ts > windowStart);

  if (userStore.timestamps.length >= limit) {
    const oldest = userStore.timestamps[0];
    const reset = oldest + windowMs;
    return {
      success: false,
      remaining: 0,
      reset,
    };
  }

  userStore.timestamps.push(now);
  return {
    success: true,
    remaining: limit - userStore.timestamps.length,
    reset: now + windowMs,
  };
}
