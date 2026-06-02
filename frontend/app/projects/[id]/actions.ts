'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import type { Task } from '@/lib/api';

const GATEWAY = process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_API_URL!;

export async function createTask(data: {
  title: string;
  description?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  dueDate?: string;
  projectId: string;
  assigneeId: string;
}): Promise<{ task?: Task; error?: string }> {
  const token = cookies().get('token')?.value;

  const res = await fetch(`${GATEWAY}/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  const body = (await res.json()) as { task?: Task; error?: string };

  if (!res.ok) {
    return { error: body.error ?? 'Failed to create task' };
  }

  return { task: body.task };
}

export async function updateTaskStatus(
  taskId: string,
  status: 'TODO' | 'IN_PROGRESS' | 'DONE',
): Promise<{ error?: string }> {
  const token = cookies().get('token')?.value;

  const res = await fetch(`${GATEWAY}/tasks/${taskId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  });

  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    return { error: body.error ?? 'Failed to update task status' };
  }

  return {};
}

// ADMIN-only: update a task's fields. Gateway enforces the role guard.
export async function updateTask(
  taskId: string,
  data: {
    title?: string;
    description?: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH';
    dueDate?: string;
    assigneeId?: string;
  },
): Promise<{ task?: Task; error?: string }> {
  const token = cookies().get('token')?.value;

  const res = await fetch(`${GATEWAY}/tasks/${taskId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  const body = (await res.json().catch(() => ({}))) as { task?: Task; error?: string };

  if (!res.ok) {
    return { error: body.error ?? 'Failed to update task' };
  }

  revalidatePath('/projects/[id]', 'page');
  return { task: body.task };
}

// ADMIN-only: delete a task. Gateway enforces the role guard — MEMBERs receive 403.
export async function deleteTask(taskId: string): Promise<{ error?: string }> {
  const token = cookies().get('token')?.value;

  const res = await fetch(`${GATEWAY}/tasks/${taskId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok && res.status !== 204) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { error: body.error ?? 'Failed to delete task' };
  }

  // Revalidate so server components re-fetch after deletion
  revalidatePath('/projects/[id]', 'page');
  return {};
}
