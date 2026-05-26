'use client';

// Why 'use client': this component uses hooks (useEffect, useState), socket.io-client
// (browser WebSocket API), and @hello-pangea/dnd (DOM drag events) — all browser-only.
import { useEffect, useState } from 'react';
import { DragDropContext, Droppable, DropResult } from '@hello-pangea/dnd';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import type { Task } from '@/lib/api';
import { TaskCard } from './TaskCard';
import { CreateTaskModal } from './CreateTaskModal';
import { updateTaskStatus } from '@/app/projects/[id]/actions';

interface NotificationPayload {
  userId: string;
  type: string;
  taskId: string;
  projectId: string; // top-level field sent by notification-service
  message: string;
  task?: Task;
}

// The three columns are fixed — they map 1:1 to the Status enum in task-service.
const COLUMNS: { id: 'TODO' | 'IN_PROGRESS' | 'DONE'; label: string }[] = [
  { id: 'TODO', label: 'To Do' },
  { id: 'IN_PROGRESS', label: 'In Progress' },
  { id: 'DONE', label: 'Done' },
];

interface Props {
  projectId: string;
  userId: string;
  initialTasks: Task[];
}

export default function KanbanBoard({ projectId, userId, initialTasks }: Props) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Socket.io: connect once when the project page mounts, disconnect on unmount.
  // Without the cleanup, navigating away and back creates duplicate connections
  // and the same notification fires once per open socket.
  useEffect(() => {
    const socket: Socket = io(process.env.NEXT_PUBLIC_WS_URL!);

    socket.on('connect', () => {
      // Tell the notification service which user this socket belongs to.
      // It maps userId → socketId so it knows which socket to push events to.
      socket.emit('register', userId);
    });

    socket.on('notification', (payload: NotificationPayload) => {
      toast.success(payload.message, { duration: 4000 });

      // Only update local state if the event belongs to this project.
      // The user could have multiple project tabs open.
      if (payload.task?.projectId === projectId || payload.taskId) {
        if (payload.projectId !== projectId) return;

        if (payload.type === 'TASK_CREATED') {
          // Dedup: the WebSocket notification often arrives BEFORE the server action
          // HTTP response. If the socket fires first, the task goes in here. When
          // onCreated fires a moment later it checks the same guard and skips.
          // If onCreated fires first (slower network), the reverse happens.
          setTasks((prev) =>
            prev.some((t) => t.id === payload.taskId)
              ? prev
              : [...prev, payload.task!]
          );
        } else if (payload.type === 'TASK_UPDATED') {
          setTasks((prev) =>
            prev.map((t) => (t.id === payload.taskId ? payload.task! : t))
          );
        } else if (payload.type === 'TASK_DELETED') {
          setTasks((prev) => prev.filter((t) => t.id !== payload.taskId));
        }
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [userId, projectId]);

  // Optimistic UI update: we apply the drag result to local state immediately so
  // the board feels instant, then call the server. If the server rejects it (network
  // error, validation failure), we revert to the saved snapshot.
  async function onDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;

    // Drop outside a column or dropped in the same position — nothing to do.
    if (
      !destination ||
      (destination.droppableId === source.droppableId &&
        destination.index === source.index)
    ) {
      return;
    }

    const newStatus = destination.droppableId as 'TODO' | 'IN_PROGRESS' | 'DONE';

    // Snapshot the current state before mutating — used to revert on server error.
    const previousTasks = tasks;
    setTasks((prev) =>
      prev.map((t) => (t.id === draggableId ? { ...t, status: newStatus } : t))
    );

    const res = await updateTaskStatus(draggableId, newStatus);
    if (res.error) {
      // The server rejected the move — snap back to where the card was.
      setTasks(previousTasks);
      toast.error('Failed to move task. Try again.');
    }
  }

  const tasksByStatus = (status: string) => tasks.filter((t) => t.status === status);

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500">
          {tasks.length} task{tasks.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Add task
        </button>
      </div>

      {tasks.length === 0 && (
        <div className="text-center py-16 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl">
          <p className="text-lg font-medium text-gray-500">No tasks yet</p>
          <p className="text-sm mt-1">Click &ldquo;+ Add task&rdquo; to create your first one</p>
        </div>
      )}

      {/* DragDropContext owns the entire drag lifecycle.
          onDragEnd fires once when the user releases a card — it receives the
          source (where the drag started) and destination (where it was dropped).
          Everything inside DragDropContext can participate in drag and drop. */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLUMNS.map((col) => {
            const colTasks = tasksByStatus(col.id);
            return (
              <div key={col.id} className="bg-gray-100 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">{col.label}</h3>
                  <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded-full font-medium">
                    {colTasks.length}
                  </span>
                </div>

                {/* Droppable defines a landing zone for dragged items.
                    droppableId must match the status string exactly — this is how
                    onDragEnd knows which column a card was dropped into. */}
                <Droppable droppableId={col.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`min-h-[100px] space-y-2 rounded-xl transition-colors ${
                        snapshot.isDraggingOver ? 'bg-blue-50' : ''
                      }`}
                    >
                      {colTasks.length === 0 && !snapshot.isDraggingOver && (
                        <div className="flex items-center justify-center h-20 text-xs text-gray-400">
                          Drop tasks here
                        </div>
                      )}
                      {colTasks.map((task, index) => (
                        <TaskCard key={task.id} task={task} index={index} />
                      ))}
                      {/* Placeholder keeps the column height stable while dragging
                          so other cards don't jump around to fill the gap. */}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {showCreateModal && (
        <CreateTaskModal
          projectId={projectId}
          userId={userId}
          onCreated={(task) =>
            // Same dedup guard as the socket handler — whichever fires second
            // finds the task already in state and skips the add.
            setTasks((prev) =>
              prev.some((t) => t.id === task.id) ? prev : [...prev, task]
            )
          }
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </>
  );
}
