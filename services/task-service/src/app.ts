import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import projectRoutes from './routes/project.routes';
import taskRoutes from './routes/task.routes';
import membersRoutes from './routes/members.routes';
import { errorHandler } from './middleware/error.middleware';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'task-service' });
});

app.use('/projects', projectRoutes);
app.use('/tasks', taskRoutes);
app.use('/members', membersRoutes);

// Centralized error handler — registered last so it catches errors from all routes.
app.use(errorHandler);

export default app;
