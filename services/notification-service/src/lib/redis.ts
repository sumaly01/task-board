import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// Two separate connections are required.
//
// A Redis client that has called .subscribe() enters "subscriber mode" — the
// connection can only run pub/sub commands (SUBSCRIBE, UNSUBSCRIBE, PSUBSCRIBE).
// Any other command (GET, SET, PUBLISH) on the same connection throws an error.
//
// redisPublisher — for PUBLISH and general Redis commands (cron job uses this)
// redisSubscriber — dedicated to SUBSCRIBE; never used for anything else
export const redisPublisher = new Redis(REDIS_URL);
export const redisSubscriber = new Redis(REDIS_URL);

redisPublisher.on('error', (err) => console.error('[redis-publisher] error', err));
redisSubscriber.on('error', (err) => console.error('[redis-subscriber] error', err));
