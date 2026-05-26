import { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service';
import { findAllMembers } from '../repositories/user.repository';

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await authService.register(req.body);
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
};

export const registerAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const providedSecret = req.headers['x-admin-secret'] as string | undefined;
    const user = await authService.registerAdmin(req.body, providedSecret);
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tokens = await authService.login(req.body);
    res.json(tokens);
  } catch (err) {
    next(err);
  }
};

export const refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) {
      res.status(400).json({ error: 'refreshToken is required' });
      return;
    }
    const tokens = await authService.refresh(refreshToken);
    res.json(tokens);
  } catch (err) {
    next(err);
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authorization header required' });
      return;
    }
    const token = authHeader.split(' ')[1];
    await authService.logout(token);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

// GET /users — internal endpoint called by task-service to populate the assignee dropdown.
// Returns all MEMBER-role users with password stripped.
// Not exposed directly through the gateway — only task-service calls it container-to-container.
export const getMembers = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const users = await findAllMembers();
    // Strip passwords before returning — never send hashes over the wire
    const safeUsers = users.map(({ password: _p, ...u }) => u);
    res.json({ users: safeUsers });
  } catch (err) {
    next(err);
  }
};
