'use client';

import { useState } from 'react';
import type { Task } from '@/lib/api';

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

interface Props {
  task: Task;
  assigneeName?: string;
  isAdmin: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: (taskId: string) => void;
}

export function TaskViewModal({ task, assigneeName, isAdmin, onClose, onEdit, onDelete }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);

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
