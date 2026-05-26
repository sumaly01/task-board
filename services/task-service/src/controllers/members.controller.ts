import { Request, Response, NextFunction } from 'express';

// GET /members — admin-only endpoint to fetch all MEMBER-role users.
// Used to populate the assignee dropdown in the "Create Task" modal.
//
// WHY task-service handles this even though auth-service owns user data:
//   The gateway routes /members → task-service (consistent with the admin board context).
//   Task-service makes an internal container-to-container HTTP call to auth-service's
//   GET /users endpoint. This avoids exposing auth-service's internal endpoint through
//   the gateway directly, while keeping the task domain's API surface coherent.
export const getMembers = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const authServiceUrl = process.env.AUTH_SERVICE_URL ?? 'http://localhost:4001';

    const response = await fetch(`${authServiceUrl}/users`);

    if (!response.ok) {
      res.status(502).json({ error: 'Failed to fetch members from auth service' });
      return;
    }

    const data = await response.json() as { users: unknown[] };
    res.json({ members: data.users });
  } catch (err) {
    next(err);
  }
};
