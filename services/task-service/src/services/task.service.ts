import { Priority, Status } from '@prisma/client';
import { AppError } from '../middleware/error.middleware';
import * as taskRepo from '../repositories/task.repository';
import * as projectRepo from '../repositories/project.repository';
import { getCachedTasks, setCachedTasks, invalidateTaskCache } from '../cache/task.cache';
import { publishEvent } from '../kafka/producer';
import { CreateTaskBody, UpdateTaskBody, UpdateTaskStatusBody } from '../types/task.types';

export async function createTask(body: CreateTaskBody, createdBy: string) {
  if (!body.title?.trim()) throw new AppError(400, 'Task title is required');
  if (!body.projectId) throw new AppError(400, 'projectId is required');
  if (!body.assigneeId) throw new AppError(400, 'assigneeId is required');

  const project = await projectRepo.findProjectById(body.projectId);
  if (!project) throw new AppError(404, 'Project not found');

  const task = await taskRepo.createTask({
    title: body.title.trim(),
    description: body.description,
    priority: body.priority ?? Priority.MEDIUM,
    dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
    projectId: body.projectId,
    assigneeId: body.assigneeId,
    createdBy,
  });

  await invalidateTaskCache(body.projectId);

  // Kafka: task.created — Notification Service will consume this to push a
  // WebSocket notification to the assignee (if assignee !== creator).
  await publishEvent('task.created', { taskId: task.id, projectId: task.projectId, userId: createdBy, task });

  return task;
}

// WHY role is a parameter here (Day 7):
//
// The service layer is the correct place to apply data-scoping rules because:
//   1. The controller knows about HTTP (req, res) but not business rules.
//   2. The repository knows about the DB but not who is asking.
//   3. The service knows the business rules: ADMIN sees all, MEMBER sees their own.
//
// Passing role + userId down from the controller keeps each layer responsible for
// exactly one thing. The controller extracts them from req.user; the service decides
// which query and which cache key to use.
export async function getTasksByProject(projectId: string, role: string, userId: string) {
  // Cache-aside: check the role-scoped Redis key first, fall back to DB.
  const cached = await getCachedTasks(projectId, role, userId);
  if (cached) return { tasks: cached, fromCache: true };

  const tasks =
    role === 'ADMIN'
      ? await taskRepo.findTasksByProject(projectId)
      : await taskRepo.findTasksByProjectAndAssignee(projectId, userId);

  await setCachedTasks(projectId, role, userId, tasks);
  return { tasks, fromCache: false };
}

export async function getTaskById(id: string) {
  const task = await taskRepo.findTaskById(id);
  if (!task) throw new AppError(404, 'Task not found');
  return task;
}

export async function updateTask(id: string, body: UpdateTaskBody, userId: string) {
  const existing = await taskRepo.findTaskById(id);
  if (!existing) throw new AppError(404, 'Task not found');

  const task = await taskRepo.updateTask(id, {
    title: body.title?.trim(),
    description: body.description,
    priority: body.priority as Priority | undefined,
    dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
    assigneeId: body.assigneeId,
  });

  await invalidateTaskCache(task.projectId);
  await publishEvent('task.updated', { taskId: task.id, projectId: task.projectId, userId, task });

  return task;
}

// MEMBER can update status on their own tasks — gateway does not restrict this route.
// The task-service enforces that members can only update status (not full edit/delete).
// Status updates are allowed for both roles; full PATCH /tasks/:id is also allowed for
// both in the gateway (only POST and DELETE are admin-only at the gateway level).
export async function updateTaskStatus(id: string, body: UpdateTaskStatusBody, userId: string) {
  const existing = await taskRepo.findTaskById(id);
  if (!existing) throw new AppError(404, 'Task not found');

  if (!Object.values(Status).includes(body.status as Status)) {
    throw new AppError(400, `status must be one of: ${Object.values(Status).join(', ')}`);
  }

  const task = await taskRepo.updateTaskStatus(id, body.status as Status);

  await invalidateTaskCache(task.projectId);
  await publishEvent('task.updated', { taskId: task.id, projectId: task.projectId, userId, task });

  return task;
}

export async function deleteTask(id: string, userId: string) {
  const existing = await taskRepo.findTaskById(id);
  if (!existing) throw new AppError(404, 'Task not found');

  await taskRepo.deleteTask(id);
  await invalidateTaskCache(existing.projectId);
  await publishEvent('task.deleted', {
    taskId: id,
    projectId: existing.projectId,
    userId,
    assigneeId: existing.assigneeId,
  });
}
