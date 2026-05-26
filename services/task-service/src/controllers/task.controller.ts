import { Request, Response, NextFunction } from 'express';
import * as taskService from '../services/task.service';

export const createTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const task = await taskService.createTask(req.body, req.user!.userId);
    res.status(201).json({ task });
  } catch (err) {
    next(err);
  }
};

export const getTasksByProject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.query as { projectId?: string };
    if (!projectId) {
      res.status(400).json({ error: 'projectId query parameter is required' });
      return;
    }
    // Pass role and userId so the service can return the correct scoped result:
    //   ADMIN  → all tasks for the project
    //   MEMBER → only tasks where assigneeId === userId
    const result = await taskService.getTasksByProject(
      projectId,
      req.user!.role,
      req.user!.userId,
    );
    res.json({ tasks: result.tasks });
  } catch (err) {
    next(err);
  }
};

export const getTaskById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const task = await taskService.getTaskById(req.params.id);
    res.json({ task });
  } catch (err) {
    next(err);
  }
};

export const updateTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const task = await taskService.updateTask(req.params.id, req.body, req.user!.userId);
    res.json({ task });
  } catch (err) {
    next(err);
  }
};

export const updateTaskStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const task = await taskService.updateTaskStatus(req.params.id, req.body, req.user!.userId);
    res.json({ task });
  } catch (err) {
    next(err);
  }
};

export const deleteTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await taskService.deleteTask(req.params.id, req.user!.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};
