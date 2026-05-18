import express from 'express';
import cors from 'cors';

const app = express();
const PORT = Number(process.env.PORT) || 4003;

app.use(cors());
app.use(express.json());

// Day 1: health check only.
// Day 4: Kafka consumer, Socket.io server, and node-cron will be added here.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'notification-service' });
});

app.listen(PORT, () => {
  console.log(`Notification Service running on port ${PORT}`);
});

export default app;
