import { Request, Response, NextFunction } from 'express';

// requireRole is a middleware factory — it returns a middleware function configured
// for the allowed roles you pass in.
//
// WHY a factory instead of a single middleware:
//   Different routes need different role requirements. A factory lets you write:
//     app.post('/projects', requireRole('ADMIN'))
//     app.get('/members', requireRole('ADMIN'))
//   rather than having one giant middleware that checks both the path AND the role.
//
// WHY this check belongs in the API Gateway and NOT task-service:
//   The gateway is the single enforcement point for all external traffic. Any request
//   that gets past the gateway has been authenticated AND authorized. Task-service then
//   only needs to scope queries by role — it doesn't need to enforce "can this role
//   call this endpoint at all". Defence-in-depth is achieved because task-service
//   auth.middleware still reads req.user.role for query scoping.
//
// IMPORTANT: jwtMiddleware must run BEFORE requireRole so that req.user is populated.
// In app.ts, jwtMiddleware is applied via app.use(['/projects', '/tasks', '/members'], ...)
// so req.user is always set by the time requireRole runs on those paths.
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.user?.role;

    if (!role) {
      res.status(401).json({ error: 'Authorization required' });
      return;
    }

    if (!allowedRoles.includes(role)) {
      res.status(403).json({
        error: `Forbidden: requires one of [${allowedRoles.join(', ')}]`,
      });
      return;
    }

    next();
  };
}
