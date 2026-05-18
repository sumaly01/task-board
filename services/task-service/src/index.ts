import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();
const PORT = Number(process.env.PORT) || 4002;

app.use(helmet());
app.use(cors());
app.use(express.json());

// Day 1: health check only.
// Day 3: project and task CRUD routes, Redis caching, and Kafka producer will be added here.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'task-service' });
});

app.listen(PORT, () => {
  console.log(`Task Service running on port ${PORT}`);
});

export default app;
