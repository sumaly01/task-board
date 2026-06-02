'use client';

import { useState, useTransition } from 'react';
import { createTask, updateTask } from '@/app/projects/[id]/actions';
import type { Task, Member } from '@/lib/api';

interface Props {
  projectId: string;
  userId: string;
  members: Member[];
  task?: Task; // when present → edit mode
  onCreated?: (task: Task) => void;
  onUpdated?: (task: Task) => void;
  onClose: () => void;
}

export function CreateTaskModal({ projectId, userId, members, task, onCreated, onUpdated, onClose }: Props) {
  const isEdit = !!task;

  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>(task?.priority ?? 'MEDIUM');
  const [dueDate, setDueDate] = useState(task?.dueDate ? task.dueDate.slice(0, 10) : '');
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId ?? members[0]?.id ?? userId);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    startTransition(async () => {
      if (isEdit) {
        const result = await updateTask(task!.id, {
          title,
          description: description || undefined,
          priority,
          dueDate: dueDate || undefined,
          assigneeId,
        });

        if (!result) { setError('Unexpected error — please try again'); return; }
        if (result.error) { setError(result.error); return; }
        if (result.task && onUpdated) onUpdated(result.task);
      } else {
        const result = await createTask({
          title,
          description: description || undefined,
          priority,
          dueDate: dueDate || undefined,
          projectId,
          assigneeId,
        });

        if (!result) { setError('Unexpected error — please try again'); return; }
        if (result.error) { setError(result.error); return; }
        if (result.task && onCreated) onCreated(result.task);
      }

      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{isEdit ? 'Edit task' : 'Create task'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assign to</label>
            {members.length > 0 ? (
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.email})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                placeholder="User ID"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
            {members.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">No members registered yet — enter a user ID manually</p>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors"
            >
              {isPending ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save changes' : 'Create task')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
