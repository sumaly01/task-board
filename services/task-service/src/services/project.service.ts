import { AppError } from '../middleware/error.middleware';
import * as projectRepo from '../repositories/project.repository';
import { CreateProjectBody } from '../types/task.types';

export async function createProject(body: CreateProjectBody, ownerId: string) {
  if (!body.name?.trim()) throw new AppError(400, 'Project name is required');
  return projectRepo.createProject({ name: body.name.trim(), ownerId });
}

export async function getProjectsByOwner(ownerId: string) {
  return projectRepo.findProjectsByOwner(ownerId);
}

export async function getProjectById(id: string) {
  const project = await projectRepo.findProjectById(id);
  if (!project) throw new AppError(404, 'Project not found');
  return project;
}
