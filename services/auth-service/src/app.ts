import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/auth.routes';
import { errorHandler } from './middleware/error.middleware';
import { getMembers } from './controllers/auth.controller';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'auth-service' });
});

app.use('/auth', authRoutes);

// Internal endpoint: task-service calls this container-to-container to fetch the
// member list for the admin's assignee dropdown. Not exposed through the gateway
// directly — the gateway routes GET /members → task-service → here.
app.get('/users', getMembers);

// Centralized error handler — must be registered AFTER all routes.
// Any next(err) call from a controller lands here instead of crashing the process.
app.use(errorHandler);

export default app;
