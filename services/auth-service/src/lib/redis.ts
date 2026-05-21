import Redis from 'ioredis';

// Singleton Redis client shared across the service.
// Used for: refresh token storage, access token blacklist.
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

export default redis;
