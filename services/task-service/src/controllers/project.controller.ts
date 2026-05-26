import { Request, Response, NextFunction } from 'express';
import * as projectService from '../services/project.service';

export const createProject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await projectService.createProject(req.body, req.user!.userId);
    res.status(201).json({ project });
  } catch (err) {
    next(err);
  }
};

export const getProjects = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Pass role + userId so the service returns the correct scoped result:
    //   ADMIN  → all projects in the system
    //   MEMBER → only projects with at least one task assigned to this member
    const projects = await projectService.getProjects(req.user!.role, req.user!.userId);
    res.json({ projects });
  } catch (err) {
    next(err);
  }
};

export const getProjectById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await projectService.getProjectById(req.params.id);
    res.json({ project });
  } catch (err) {
    next(err);
  }
};
