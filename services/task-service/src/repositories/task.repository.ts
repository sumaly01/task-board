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
    aiEnriched?: boolean;
  },
): Promise<Task> => {
  return prisma.task.update({
    where: { id },
    data: data as unknown as import('@prisma/client').Prisma.TaskUpdateInput,
  });
};

export const updateTaskStatus = async (id: string, status: Status): Promise<Task> => {
  return prisma.task.update({ where: { id }, data: { status } });
};

export const deleteTask = async (id: string): Promise<Task> => {
  return prisma.task.delete({ where: { id } });
};

// Writes AI enrichment fields produced by ai-service onto an existing task.
// Called when task-service consumes a task.enriched Kafka event.
// aiEnriched=true is the flag the frontend watches to show the suggestions badge.
export const applyAiEnrichment = async (
  id: string,
  data: {
    aiDescription: string;
    aiPriority: string;
    aiEffort: string;
    aiTags: string[];
  },
): Promise<Task> => {
  // WHY the cast: Prisma's generated client types reflect the DB schema at the time
  // `prisma generate` was last run. The AI fields were added to schema.prisma but
  // the migration hasn't been applied yet, so the client types don't include them.
  // Once `npx prisma migrate dev --name add_ai_enrichment_fields` is run, the client
  // regenerates and this cast becomes unnecessary — the types will resolve naturally.
  return prisma.task.update({
    where: { id },
    data: {
      aiDescription: data.aiDescription,
      aiPriority: data.aiPriority as import('@prisma/client').Priority,
      aiEffort: data.aiEffort,
      aiTags: data.aiTags,
      aiEnriched: true,
    } as unknown as import('@prisma/client').Prisma.TaskUpdateInput,
  });
};
