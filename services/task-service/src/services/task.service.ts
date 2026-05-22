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

  // Kafka: task.created — Notification Service (Day 4) will consume this to push
  // a real-time WebSocket notification to the assignee.
  await publishEvent('task.created', { taskId: task.id, projectId: task.projectId, userId: createdBy, task });

  return task;
}

export async function getTasksByProject(projectId: string) {
  // Cache-aside pattern: check Redis first, fall back to DB, populate cache on miss.
  const cached = await getCachedTasks(projectId);
  if (cached) return { tasks: cached, fromCache: true };

  const tasks = await taskRepo.findTasksByProject(projectId);
  await setCachedTasks(projectId, tasks);
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
  });
}
