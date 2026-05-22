import { Task } from '@prisma/client';
import redis from '../lib/redis';

// Cache key format from CLAUDE.md: {entity}:{scope}:{id}
const CACHE_TTL = 60; // seconds

function cacheKey(projectId: string): string {
  return `tasks:project:${projectId}`;
}

// Why delete on write instead of updating the cache?
//
// When a task is created, updated, or deleted, the cached list is stale.
// Option 1 (update): fetch the old list, apply the change in memory, write it back.
//   Problem: two concurrent writes can race — both read the same stale list, both
//   apply their change independently, and the second write overwrites the first.
//   The cache ends up missing a task.
// Option 2 (delete/invalidate): just remove the key. The next GET will find no
//   cache entry, query the DB for the real state, and re-populate the cache.
//   This is always correct because the DB is the source of truth. One extra DB
//   query per write is a trivial cost for guaranteed correctness.
export async function getCachedTasks(projectId: string): Promise<Task[] | null> {
  const raw = await redis.get(cacheKey(projectId));
  if (!raw) return null;
  return JSON.parse(raw) as Task[];
}

export async function setCachedTasks(projectId: string, tasks: Task[]): Promise<void> {
  await redis.set(cacheKey(projectId), JSON.stringify(tasks), 'EX', CACHE_TTL);
}

export async function invalidateTaskCache(projectId: string): Promise<void> {
  await redis.del(cacheKey(projectId));
}
