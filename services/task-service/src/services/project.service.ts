import { AppError } from '../middleware/error.middleware';
import * as projectRepo from '../repositories/project.repository';
import { CreateProjectBody } from '../types/task.types';

export async function createProject(body: CreateProjectBody, ownerId: string) {
  if (!body.name?.trim()) throw new AppError(400, 'Project name is required');
  return projectRepo.createProject({ name: body.name.trim(), ownerId });
}

// WHY role-scoped project queries (Day 7):
//
// ADMIN: sees every project in the system — they manage all work.
// MEMBER: sees only projects where they have at least one task assigned.
//   A member who is not assigned any task in a project has no reason to see it —
//   they can't create tasks or see others' work there anyway.
//
// This mirrors the frontend dashboard split: admin sees all, member sees their slice.
export async function getProjects(role: string, userId: string) {
  if (role === 'ADMIN') {
    return projectRepo.findAllProjects();
  }
  return projectRepo.findProjectsForMember(userId);
}

export async function getProjectById(id: string) {
  const project = await projectRepo.findProjectById(id);
  if (!project) throw new AppError(404, 'Project not found');
  return project;
}
