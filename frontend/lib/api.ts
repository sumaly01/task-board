import { cookies } from 'next/headers';

// GATEWAY_URL is a server-only variable (no NEXT_PUBLIC_ prefix).
// Locally it points to http://localhost:4000.
// In Docker it points to http://api-gateway:4000 — the internal service name —
// because "localhost" inside the frontend container is the frontend container itself,
// not the gateway. NEXT_PUBLIC_API_URL stays as the browser-facing URL (localhost:4000).
const GATEWAY = process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_API_URL!;

// Server-side fetch helper — always reads the token from the httpOnly cookie.
// Only usable in server components and server actions (not client components).
async function serverFetch(path: string, init?: RequestInit) {
  const token = cookies().get('token')?.value;
  return fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  });
}

export interface Project {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  dueDate: string | null;
  assigneeId: string;
  projectId: string;
  createdAt: string;
}

export async function fetchProjects(): Promise<Project[]> {
  const res = await serverFetch('/projects');
  if (!res.ok) return [];
  const data = await res.json() as { projects: Project[] };
  return data.projects ?? [];
}

export async function fetchProject(id: string): Promise<Project | null> {
  const res = await serverFetch(`/projects/${id}`);
  if (!res.ok) return null;
  const data = await res.json() as { project: Project };
  return data.project ?? null;
}

export async function fetchTasks(projectId: string): Promise<Task[]> {
  const res = await serverFetch(`/tasks?projectId=${projectId}`);
  if (!res.ok) return [];
  const data = await res.json() as { tasks: Task[] };
  return data.tasks ?? [];
}
