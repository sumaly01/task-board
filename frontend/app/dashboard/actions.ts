'use server';

// Server actions run on the server when called from a client component.
// This means they can read the httpOnly cookie — the client component that
// calls createProject() never handles the token itself.
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

export async function createProject(name: string) {
  const token = cookies().get('token')?.value;

  const res = await fetch(`${process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_API_URL}/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  });

  const data = await res.json() as { error?: string; project?: unknown };

  if (!res.ok) {
    return { error: data.error ?? 'Failed to create project' };
  }

  // Revalidate the dashboard path so the server component re-fetches
  // the updated project list without a full page reload.
  revalidatePath('/dashboard');
  return { success: true };
}
