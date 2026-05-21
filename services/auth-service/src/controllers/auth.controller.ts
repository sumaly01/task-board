import { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service';

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await authService.register(req.body);
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
