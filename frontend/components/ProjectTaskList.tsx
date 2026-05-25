'use client';

// This is a client component because it uses:
// - useEffect (lifecycle hook — runs in browser only)
// - socket.io-client (establishes a WebSocket — browser only)
// - react-hot-toast (DOM mutations — browser only)
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import type { Task } from '@/lib/api';

interface NotificationPayload {
  userId: string;
  type: string;
  taskId: string;
  message: string;
  task?: Task;
}

interface Props {
  projectId: string;
  userId: string;
  initialTasks: Task[];
  priorityColors: Record<string, string>;
  statusLabels: Record<string, string>;
}

export function ProjectTaskList({
  projectId,
  userId,
  initialTasks,
  priorityColors,
  statusLabels,
}: Props) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);

  useEffect(() => {
    // io() opens a WebSocket connection to the notification service.
    // This runs when the component mounts (user navigates to the project page).
    const socket: Socket = io(process.env.NEXT_PUBLIC_WS_URL!);

    socket.on('connect', () => {
      // Tell the notification service which user this socket belongs to.
      // Without this, the server has no way to know which socket to target
      // when it receives a Kafka event for this userId.
      socket.emit('register', userId);
    });

    socket.on('notification', (payload: NotificationPayload) => {
      toast.success(payload.message, { duration: 4000 });

      // Update local task list when the event affects this project,
      // so the UI reflects changes without a full page reload.
      if (payload.task?.projectId === projectId) {
        if (payload.type === 'TASK_CREATED') {
          setTasks((prev) => [...prev, payload.task!]);
        } else if (payload.type === 'TASK_UPDATED') {
          setTasks((prev) =>
            prev.map((t) => (t.id === payload.taskId ? payload.task! : t))
          );
        } else if (payload.type === 'TASK_DELETED') {
          setTasks((prev) => prev.filter((t) => t.id !== payload.taskId));
        }
      }
    });

    // Why disconnect on unmount:
    // When the user navigates away from this page, React unmounts this component.
    // If we don't disconnect, the socket stays open in memory. The next time the
    // user visits the page a NEW socket is created — now there are two sockets
    // registered for the same userId. Notifications arrive twice. After enough
    // navigations you accumulate N open sockets. The cleanup function in useEffect
    // runs on unmount and closes the connection cleanly.
    return () => {
      socket.disconnect();
    };
  }, [userId, projectId]);

  if (tasks.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-lg font-medium">No tasks yet</p>
        <p className="text-sm mt-1">Create your first task via Postman to see it here</p>
      </div>
    );
  }

  // Group tasks by status for a cleaner view (full Kanban columns come in Day 6)
  const grouped: Record<string, Task[]> = { TODO: [], IN_PROGRESS: [], DONE: [] };
  for (const task of tasks) {
    grouped[task.status]?.push(task);
  }

  return (
    <div className="space-y-8">
      {(Object.entries(grouped) as [string, Task[]][]).map(([status, statusTasks]) => (
        <section key={status}>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {statusLabels[status] ?? status} ({statusTasks.length})
          </h3>

          {statusTasks.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No tasks</p>
          ) : (
            <div className="space-y-2">
              {statusTasks.map((task) => (
                <div
                  key={task.id}
                  className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-start justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{task.title}</p>
                    {task.description && (
                      <p className="text-sm text-gray-500 mt-0.5 truncate">{task.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      {task.dueDate && (
                        <span>Due {new Date(task.dueDate).toLocaleDateString()}</span>
                      )}
                      <span>Assignee: {task.assigneeId.slice(0, 8)}…</span>
                    </div>
                  </div>

                  <span
                    className={`shrink-0 text-xs font-medium px-2 py-1 rounded-md ${
                      priorityColors[task.priority] ?? 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {task.priority}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
