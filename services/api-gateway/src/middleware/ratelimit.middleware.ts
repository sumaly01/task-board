import { Request, Response, NextFunction } from 'express';
import redis from '../lib/redis';

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 100;

// Sliding window rate limiter using a Redis sorted set.
//
// Each request adds its timestamp (ms) as the ZADD score. Before counting,
// entries older than the window are removed with ZREMRANGEBYSCORE.
// This means the count always reflects the last WINDOW_SECONDS of activity,
// not a fixed bucket that resets hard at the minute boundary.
//
// Example with MAX_REQUESTS=100, WINDOW_SECONDS=60:
//   If 99 requests arrived 58 seconds ago, 1 more is allowed now.
//   If 100 arrived 58 seconds ago, 0 more are allowed until 2 seconds pass
//   and the oldest entries age out. A fixed window would allow 100 again
//   the moment the clock ticks to a new minute — sliding prevents that burst.
function createRateLimiter(keyFn: (req: Request) => string) {
  return async function rateLimiter(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const key = `ratelimit:${keyFn(req)}`;
    const now = Date.now();
    const windowStart = now - WINDOW_SECONDS * 1000;

    await redis.zremrangebyscore(key, '-inf', windowStart);
    const count = await redis.zcard(key);

    if (count >= MAX_REQUESTS) {
      res.status(429).json({ error: 'Too many requests, please try again later' });
      return;
    }

    // Score = timestamp in ms; member includes random suffix to prevent collision
    // when two requests arrive at the same millisecond.
    await redis.zadd(key, now, `${now}-${Math.random()}`);
    await redis.expire(key, WINDOW_SECONDS);

    res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
    res.setHeader('X-RateLimit-Remaining', MAX_REQUESTS - count - 1);

    next();
  };
}

// For /auth/* routes — keyed by IP because the user is not yet authenticated.
export const ipRateLimiter = createRateLimiter((req) => {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  return `ip:${ip.replace(/:/g, '_')}`;
});

// For /projects/* and /tasks/* routes — keyed by userId (set by jwtMiddleware
// which runs before this middleware on those paths).
export const userRateLimiter = createRateLimiter((req) => `user:${req.user?.userId ?? 'anon'}`);
