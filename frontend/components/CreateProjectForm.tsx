'use client';

import { useState, useTransition } from 'react';
import { createProject } from '@/app/dashboard/actions';

export function CreateProjectForm() {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  // useTransition tracks when a server action is in-flight so we can show loading state
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    startTransition(async () => {
      const result = await createProject(name);
      if (result.error) {
        setError(result.error);
        return;
      }
      // revalidatePath in the server action will refresh the project list
      setName('');
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
      >
        + New project
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-start gap-2">
      <div>
        <input
          type="text"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
      >
        {isPending ? 'Creating…' : 'Create'}
      </button>
      <button
        type="button"
        onClick={() => { setOpen(false); setName(''); setError(''); }}
        className="px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 transition-colors"
      >
        Cancel
      </button>
    </form>
  );
}
