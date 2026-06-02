'use client';

import { useState } from 'react';
import type { Task } from '@/lib/api';
import { acceptAiSuggestions, dismissAiSuggestions } from '@/app/projects/[id]/actions';

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  HIGH: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
};

const EFFORT_LABELS: Record<string, string> = {
  XS: 'XS — under an hour',
  S: 'S — half a day',
  M: 'M — 1-2 days',
  L: 'L — 3-5 days',
  XL: 'XL — over a week',
};

interface Props {
  task: Task;
  assigneeName?: string;
  isAdmin: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: (taskId: string) => void;
  onTaskUpdated: (task: Task) => void;
}

export function TaskViewModal({ task, assigneeName, isAdmin, onClose, onEdit, onDelete, onTaskUpdated }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [aiPending, setAiPending] = useState(false);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 leading-snug">{task.title}</h2>
            <div className="flex items-center gap-2 mt-1.5">
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-md ${
                  PRIORITY_COLORS[task.priority] ?? 'bg-gray-100 text-gray-600'
                }`}
              >
                {task.priority}
              </span>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                {STATUS_LABELS[task.status] ?? task.status}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0">
            &times;
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {task.description && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Description</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {task.dueDate && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Due date</p>
                <p className="text-sm text-gray-700">{task.dueDate.slice(0, 10)}</p>
              </div>
            )}
            {assigneeName && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Assigned to</p>
                <p className="text-sm text-gray-700">{assigneeName}</p>
              </div>
            )}
          </div>

          {/* AI Suggestions Panel — visible to ADMIN only when aiEnriched=true.
              WHY admin only: suggestions are for the task creator to review before
              applying. Members see the final task fields, not the AI drafts. */}
          {isAdmin && task.aiEnriched && (
            <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 space-y-3">
              <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">
                ✨ AI Suggestions
              </p>

              {task.aiDescription && (
                <div>
                  <p className="text-xs text-purple-600 font-medium mb-0.5">Description</p>
                  <p className="text-sm text-gray-700">{task.aiDescription}</p>
                </div>
              )}

              <div className="flex gap-4">
                {task.aiPriority && (
                  <div>
                    <p className="text-xs text-purple-600 font-medium mb-0.5">Priority</p>
                    <p className="text-sm text-gray-700">{task.aiPriority}</p>
                  </div>
                )}
                {task.aiEffort && (
                  <div>
                    <p className="text-xs text-purple-600 font-medium mb-0.5">Effort</p>
                    <p className="text-sm text-gray-700">{EFFORT_LABELS[task.aiEffort] ?? task.aiEffort}</p>
                  </div>
                )}
              </div>

              {task.aiTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {task.aiTags.map((tag) => (
                    <span key={tag} className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  disabled={aiPending}
                  onClick={async () => {
                    setAiPending(true);
                    const res = await acceptAiSuggestions(task.id, {
                      description: task.aiDescription!,
                      priority: task.aiPriority!,
                    });
                    setAiPending(false);
                    if (res.task) onTaskUpdated(res.task);
                    else if (!res.error) onClose();
                  }}
                  className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {aiPending ? 'Applying…' : 'Accept all'}
                </button>
                <button
                  disabled={aiPending}
                  onClick={async () => {
                    setAiPending(true);
                    await dismissAiSuggestions(task.id);
                    setAiPending(false);
                    onTaskUpdated({ ...task, aiEnriched: false });
                  }}
                  className="flex-1 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors disabled:opacity-50"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {isAdmin && (
            <div className="pt-2 border-t border-gray-100">
              {!confirmDelete ? (
                <div className="flex gap-2">
                  <button
                    onClick={onEdit}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                  >
                    Edit task
                  </button>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </div>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="text-sm font-medium text-red-800 mb-3">
                    Delete &quot;{task.title}&quot;? This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        onDelete(task.id);
                        onClose();
                      }}
                      className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                    >
                      Yes, delete
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
