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
  try {
    const token = cookies().get('token')?.value;

    const res = await fetch(`${GATEWAY}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    const body = (await res.json().catch(() => ({}))) as { task?: Task; error?: string };

    if (!res.ok) {
      return { error: body.error ?? 'Failed to create task' };
    }

    return { task: body.task };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to create task' };
  }
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
    aiEnriched?: boolean; // used by acceptAiSuggestions/dismissAiSuggestions to clear the badge
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

// ADMIN-only: apply AI suggestions to the real task fields.
// Copies aiDescription → description and aiPriority → priority, then clears
// the aiEnriched flag so the ✨ badge disappears after the admin has reviewed.
export async function acceptAiSuggestions(
  taskId: string,
  suggestions: { description: string; priority: 'LOW' | 'MEDIUM' | 'HIGH' },
): Promise<{ task?: Task; error?: string }> {
  return updateTask(taskId, {
    description: suggestions.description,
    priority: suggestions.priority,
    aiEnriched: false,
  });
}

// ADMIN-only: dismiss AI suggestions without applying them.
// Sets aiEnriched=false so the badge clears — the AI fields remain in the DB
// but the frontend stops surfacing them.
export async function dismissAiSuggestions(taskId: string): Promise<{ error?: string }> {
  const token = cookies().get('token')?.value;

  const res = await fetch(`${GATEWAY}/tasks/${taskId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ aiEnriched: false }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { error: body.error ?? 'Failed to dismiss suggestions' };
  }

  return {};
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
