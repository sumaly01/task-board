import { Project } from '@prisma/client';
import prisma from '../lib/prisma';

// All Prisma calls for the Project model live here.
// Services never import prisma directly — this gives a seam for test mocking.

export const createProject = async (data: {
  name: string;
  ownerId: string;
}): Promise<Project> => {
  return prisma.project.create({ data });
};

export const findProjectsByOwner = async (ownerId: string): Promise<Project[]> => {
  return prisma.project.findMany({ where: { ownerId }, orderBy: { createdAt: 'desc' } });
};

// ADMIN: returns every project in the system.
export const findAllProjects = async (): Promise<Project[]> => {
  return prisma.project.findMany({ orderBy: { createdAt: 'desc' } });
};

// MEMBER: returns only projects that have at least one task assigned to this member.
// Prisma's `some` filter translates to EXISTS (SELECT 1 FROM Task WHERE assigneeId = userId).
export const findProjectsForMember = async (userId: string): Promise<Project[]> => {
  return prisma.project.findMany({
    where: { tasks: { some: { assigneeId: userId } } },
    orderBy: { createdAt: 'desc' },
  });
};

export const findProjectById = async (id: string) => {
  return prisma.project.findUnique({
    where: { id },
    include: { tasks: { orderBy: { createdAt: 'desc' } } },
  });
};
