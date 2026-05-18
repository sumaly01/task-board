import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();
const PORT = Number(process.env.PORT) || 4001;

app.use(helmet());
app.use(cors());
app.use(express.json());

// Day 1: health check only.
// Day 2: register, login, refresh, logout routes will be added here.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'auth-service' });
});

app.listen(PORT, () => {
  console.log(`Auth Service running on port ${PORT}`);
});

export default app;
