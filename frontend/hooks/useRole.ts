'use client';

// WHY a dedicated hook instead of reading document.cookie inline everywhere:
//   Centralising the role read means one change here fixes the whole app. If we
//   later move from a cookie to a context or Zustand store, only this file changes.
//   Also ensures the fallback ('MEMBER') is applied consistently — a missing cookie
//   always results in the least-privileged role, never an undefined that crashes a
//   conditional render.

export type Role = 'ADMIN' | 'MEMBER';

export function useRole(): Role {
  if (typeof document === 'undefined') return 'MEMBER'; // SSR safety

  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith('role='));

  const value = match?.split('=')[1];
  return value === 'ADMIN' ? 'ADMIN' : 'MEMBER';
}
