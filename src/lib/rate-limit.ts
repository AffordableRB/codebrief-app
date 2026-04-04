// Simple in-memory rate limiter
// In production with multiple Vercel instances, use Vercel KV or Upstash Redis

const requests = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 3; // 3 briefs per minute per IP

export function rateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = requests.get(ip);

  // Clean up stale entries periodically
  if (requests.size > 10000) {
    for (const [key, val] of requests) {
      if (val.resetAt < now) requests.delete(key);
    }
  }

  if (!entry || entry.resetAt < now) {
    requests.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1 };
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - entry.count };
}
