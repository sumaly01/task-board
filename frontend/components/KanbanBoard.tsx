'use client';

// Why 'use client': uses hooks (useEffect, useState), socket.io-client, and @hello-pangea/dnd
import { useEffect, useState } from 'react';
import { DragDropContext, Droppable, DropResult } from '@hello-pangea/dnd';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import type { Task, Member } from '@/lib/api';
import { TaskCard } from './TaskCard';
import { CreateTaskModal } from './CreateTaskModal';
import { TaskViewModal } from './TaskViewModal';
import { updateTaskStatus, deleteTask } from '@/app/projects/[id]/actions';

interface NotificationPayload {
  userId: string;
  type: string;
  taskId: string;
  projectId: string;
  message: string;
  task?: Task;
}

const COLUMNS: { id: 'TODO' | 'IN_PROGRESS' | 'DONE'; label: string }[] = [
  { id: 'TODO', label: 'To Do' },
  { id: 'IN_PROGRESS', label: 'In Progress' },
  { id: 'DONE', label: 'Done' },
];

interface Props {
  projectId: string;
  userId: string;
  userName: string;
  // WHY role as a prop (Day 7):
  //   The server component (page.tsx) reads role from the cookie server-side and
  //   passes it down. This pattern keeps the role check close to the data fetch —
  //   the server already knows the role when deciding which tasks and members to
  //   fetch. The client component receives it as a plain prop and uses it only for
  //   conditional rendering (not for access control, which lives in the API).
  role: 'ADMIN' | 'MEMBER';
  initialTasks: Task[];
  members: Member[]; // populated only for ADMIN — empty array for MEMBER
}

export default function KanbanBoard({ projectId, userId, userName, role, initialTasks, members }: Props) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const isAdmin = role === 'ADMIN';

  // Build an id→name lookup so TaskCard can show the assignee's name.
  // For ADMIN: populated from the members list fetched server-side.
  // For MEMBER: they only see their own tasks, so we seed the map with their own name.
  const memberNameMap = new Map<string, string>(members.map((m) => [m.id, m.name]));
  if (!isAdmin && userName) memberNameMap.set(userId, userName);

  // Socket.io: connect once on mount, disconnect on unmount.
  // The cleanup prevents duplicate connections when navigating away and back.
  useEffect(() => {
    const socket: Socket = io(process.env.NEXT_PUBLIC_WS_URL!);

    socket.on('connect', () => {
      socket.emit('register', userId);
    });

    socket.on('notification', (payload: NotificationPayload) => {
      toast.success(payload.message, { duration: 4000 });

      if (payload.projectId !== projectId) return;

      if (payload.type === 'TASK_CREATED') {
        setTasks((prev) =>
          prev.some((t) => t.id === payload.taskId) ? prev : [payload.task!, ...prev]
        );
      } else if (payload.type === 'TASK_UPDATED') {
        setTasks((prev) =>
          prev.map((t) => (t.id === payload.taskId ? payload.task! : t))
        );
      } else if (payload.type === 'TASK_DELETED') {
        setTasks((prev) => prev.filter((t) => t.id !== payload.taskId));
      } else if (payload.type === 'TASK_AI_ENRICHED') {
        // WHY we update local state on TASK_AI_ENRICHED:
        // The enrichment arrives ~2-5s after task creation. Without this handler
        // the task card would only show the ✨ badge after a page refresh.
        // Merging the AI fields into local state means the badge and suggestions
        // panel appear immediately when the Socket.io event arrives — no reload.
        setTasks((prev) =>
          prev.map((t) => (t.id === payload.taskId ? { ...t, ...(payload.task as Task) } : t))
        );
        // Also update the viewing modal if it's open on this task
        setViewingTask((prev) =>
          prev?.id === payload.taskId ? { ...prev, ...(payload.task as Task) } : prev
        );
      }
    });

    return () => { socket.disconnect(); };
  }, [userId, projectId]);

  // Optimistic drag-and-drop: update local state immediately, confirm with server.
  // If the server rejects the move, revert to the saved snapshot.
  async function onDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;

    if (
      !destination ||
      (destination.droppableId === source.droppableId && destination.index === source.index)
    ) return;

    const newStatus = destination.droppableId as 'TODO' | 'IN_PROGRESS' | 'DONE';
    const previousTasks = tasks;
    setTasks((prev) => prev.map((t) => (t.id === draggableId ? { ...t, status: newStatus } : t)));

    const res = await updateTaskStatus(draggableId, newStatus);
    if (res.error) {
      setTasks(previousTasks);
      toast.error('Failed to move task. Try again.');
    }
  }

  // ADMIN-only: delete a task with optimistic removal.
  async function handleDelete(taskId: string) {
    const previousTasks = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== taskId));

    const res = await deleteTask(taskId);
    if (res.error) {
      setTasks(previousTasks);
      toast.error('Failed to delete task. Try again.');
    }
  }

  const tasksByStatus = (status: string) => tasks.filter((t) => t.status === status);

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500">
          {tasks.length} task{tasks.length !== 1 ? 's' : ''}
          {!isAdmin && ' assigned to you'}
        </p>
        {/* WHY hide "+ Add task" for MEMBER:
            The gateway blocks POST /tasks for MEMBERs with 403. Hiding the button
            makes the UI consistent with the API — members never hit a confusing error. */}
        {isAdmin && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + Add task
          </button>
        )}
      </div>

      {tasks.length === 0 && (
        <div className="text-center py-16 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl">
          <p className="text-lg font-medium text-gray-500">No tasks yet</p>
          <p className="text-sm mt-1">
            {isAdmin ? 'Click "+ Add task" to create your first one' : 'Tasks assigned to you will appear here'}
          </p>
        </div>
      )}

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
                        <TaskCard
                          key={task.id}
                          task={task}
                          index={index}
                          assigneeName={memberNameMap.get(task.assigneeId)}
                          isAdmin={isAdmin}
                          onView={setViewingTask}
                        />
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {/* Task view modal — opens for both admin and member when clicking a card */}
      {viewingTask && (
        <TaskViewModal
          task={viewingTask}
          assigneeName={memberNameMap.get(viewingTask.assigneeId)}
          isAdmin={isAdmin}
          onClose={() => setViewingTask(null)}
          onEdit={() => {
            setEditingTask(viewingTask);
            setViewingTask(null);
          }}
          onDelete={(taskId) => {
            handleDelete(taskId);
            setViewingTask(null);
          }}
          onTaskUpdated={(updated) => {
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            setViewingTask(updated);
          }}
        />
      )}

      {/* Edit modal — pre-populated with existing task data, ADMIN only */}
      {editingTask && isAdmin && (
        <CreateTaskModal
          projectId={projectId}
          userId={userId}
          members={members}
          task={editingTask}
          onUpdated={(updated) =>
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
          }
          onClose={() => setEditingTask(null)}
        />
      )}

      {/* Create modal — ADMIN only */}
      {showCreateModal && isAdmin && (
        <CreateTaskModal
          projectId={projectId}
          userId={userId}
          members={members}
          onCreated={(task) =>
            setTasks((prev) => prev.some((t) => t.id === task.id) ? prev : [task, ...prev])
          }
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </>
  );
}
