import { Task, Status, Priority } from '@prisma/client';
import prisma from '../lib/prisma';

// All Prisma calls for the Task model live here.

export const createTask = async (data: {
  title: string;
  description?: string;
  priority?: Priority;
  dueDate?: Date;
  projectId: string;
  assigneeId: string;
  createdBy: string;
}): Promise<Task> => {
  return prisma.task.create({ data });
};

export const findTasksByProject = async (projectId: string): Promise<Task[]> => {
  return prisma.task.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  });
};

// MEMBER scoping: returns only tasks assigned to the given userId within a project.
// Used when role === 'MEMBER' so members never see tasks assigned to other users.
export const findTasksByProjectAndAssignee = async (
  projectId: string,
  assigneeId: string,
): Promise<Task[]> => {
  return prisma.task.findMany({
    where: { projectId, assigneeId },
    orderBy: { createdAt: 'desc' },
  });
};

export const findTaskById = async (id: string): Promise<Task | null> => {
  return prisma.task.findUnique({ where: { id } });
};

export const updateTask = async (
  id: string,
  data: {
    title?: string;
    description?: string;
    priority?: Priority;
    dueDate?: Date | null;
    assigneeId?: string;
  },
): Promise<Task> => {
  return prisma.task.update({ where: { id }, data });
};

export const updateTaskStatus = async (id: string, status: Status): Promise<Task> => {
  return prisma.task.update({ where: { id }, data: { status } });
};

export const deleteTask = async (id: string): Promise<Task> => {
  return prisma.task.delete({ where: { id } });
};
