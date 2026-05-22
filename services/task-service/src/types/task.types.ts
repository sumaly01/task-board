import { Status, Priority } from '@prisma/client';

export { Status, Priority };

export interface CreateProjectBody {
  name: string;
}

export interface CreateTaskBody {
  title: string;
  description?: string;
  priority?: Priority;
  dueDate?: string;
  projectId: string;
  assigneeId: string;
}

export interface UpdateTaskBody {
  title?: string;
  description?: string;
  priority?: Priority;
  dueDate?: string;
  assigneeId?: string;
}

export interface UpdateTaskStatusBody {
  status: Status;
}

// Augment Express Request so controllers can read req.user without casting to any.
// This is set by auth.middleware.ts on every authenticated request.
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        role: string;
      };
    }
  }
}
