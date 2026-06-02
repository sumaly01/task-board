import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

// Health endpoint — Docker Compose uses this to determine when the service is ready.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ai-service' });
});

export default app;
