import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/auth.routes';
import { errorHandler } from './middleware/error.middleware';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'auth-service' });
});

app.use('/auth', authRoutes);

// Centralized error handler — must be registered AFTER all routes.
// Any next(err) call from a controller lands here instead of crashing the process.
app.use(errorHandler);

export default app;
