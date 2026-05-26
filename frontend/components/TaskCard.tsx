'use client';

import { Draggable } from '@hello-pangea/dnd';
import type { Task } from '@/lib/api';

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  HIGH: 'bg-red-100 text-red-700',
};

interface Props {
  task: Task;
  index: number;
}

export function TaskCard({ task, index }: Props) {
  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`bg-white border rounded-xl px-4 py-3 cursor-grab active:cursor-grabbing select-none transition-shadow ${
            snapshot.isDragging
              ? 'shadow-lg border-blue-300 rotate-1'
              : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium text-gray-900 text-sm leading-snug">{task.title}</p>
            <span
              className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-md ${
                PRIORITY_COLORS[task.priority] ?? 'bg-gray-100 text-gray-600'
              }`}
            >
              {task.priority}
            </span>
          </div>

          {task.description && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{task.description}</p>
          )}

          <div className="flex items-center gap-3 mt-2.5 text-xs text-gray-400">
            {task.dueDate && (
              // Slice to YYYY-MM-DD instead of toLocaleDateString() — locale-dependent
              // formatting produces different strings on the server vs browser and
              // triggers a React hydration mismatch.
              <span>Due {task.dueDate.slice(0, 10)}</span>
            )}
            <span className="font-mono truncate">
              {task.assigneeId.slice(0, 8)}&hellip;
            </span>
          </div>
        </div>
      )}
    </Draggable>
  );
}
