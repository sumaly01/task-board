import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(helmet());
app.use(cors());
app.use(express.json());

// Day 1: health check only.
// Day 4: JWT middleware, rate limiting, and proxy routing will be added here.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'api-gateway' });
});

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});

export default app;
