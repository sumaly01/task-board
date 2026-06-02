import app from './app';
import { startConsumer } from './kafka/consumer';

const PORT = Number(process.env.PORT) || 4004;

async function start() {
  try {
    await startConsumer();
  } catch (err) {
    // Non-fatal — log and continue. The service still exposes /health even if Kafka
    // is temporarily unavailable. Kafka consumer will not retry automatically here,
    // but Docker Compose restart policies handle recovery in production.
    console.error('[ai-service] Kafka consumer failed to start:', err);
  }

  app.listen(PORT, () => {
    console.log(`AI Service running on port ${PORT}`);
  });
}

start();
