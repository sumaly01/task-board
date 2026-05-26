import { Task } from '@prisma/client';
import redis from '../lib/redis';

// Cache key format from CLAUDE.md: {entity}:{scope}:{id}
const CACHE_TTL = 60; // seconds

// WHY role-scoped cache keys (Day 7):
//
// Without role scoping, a shared key `tasks:project:{projectId}` creates a data
// leak: if an ADMIN calls GET /tasks first, the cache stores ALL 50 tasks.
// The next MEMBER request hits the cache and receives all 50 tasks — including
// tasks not assigned to them. Role-scoped keys give each audience their own
// cache entry that only contains the data they're permitted to see.
//
// Key formats:
//   Admin:  tasks:project:{projectId}:admin
//   Member: tasks:project:{projectId}:member:{userId}

function adminCacheKey(projectId: string): string {
  return `tasks:project:${projectId}:admin`;
}

function memberCacheKey(projectId: string, userId: string): string {
  return `tasks:project:${projectId}:member:${userId}`;
}

export async function getCachedTasks(
  projectId: string,
  role: string,
  userId: string,
): Promise<Task[] | null> {
  const key = role === 'ADMIN' ? adminCacheKey(projectId) : memberCacheKey(projectId, userId);
  const raw = await redis.get(key);
  if (!raw) {
    console.log(`[cache] MISS  ${key}`);
    return null;
  }
  console.log(`[cache] HIT   ${key}`);
  return JSON.parse(raw) as Task[];
}

export async function setCachedTasks(
  projectId: string,
  role: string,
  userId: string,
  tasks: Task[],
): Promise<void> {
  const key = role === 'ADMIN' ? adminCacheKey(projectId) : memberCacheKey(projectId, userId);
  await redis.set(key, JSON.stringify(tasks), 'EX', CACHE_TTL);
}

// WHY pattern-based invalidation:
//
// On any task write (create, update, delete) we must invalidate:
//   - The admin cache (they see all tasks)
//   - Every member's cache whose tasks changed
//
// Rather than tracking exactly which members are affected, we use KEYS to find
// all cache entries for the project and delete them all. This is safe because
// the DB is the source of truth — a cache miss just costs one extra DB query.
//
// Note: redis.keys() is fine for a dev/portfolio project. In production with
// millions of keys, use SCAN instead to avoid blocking Redis.
export async function invalidateTaskCache(projectId: string): Promise<void> {
  const pattern = `tasks:project:${projectId}:*`;
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
    console.log(`[cache] INVALIDATED ${keys.length} key(s) for project ${projectId}`);
  }
}
