import Redis from 'ioredis';

// Singleton Redis client — used for task list caching and rate limiting (Day 4).
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

export default redis;
