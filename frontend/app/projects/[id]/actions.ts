'use server';

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
