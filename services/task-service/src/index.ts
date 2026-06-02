import app from './app';
import { connectProducer } from './kafka/producer';
import { startEnrichmentConsumer } from './kafka/consumer';

const PORT = Number(process.env.PORT) || 4002;

async function start() {
  await connectProducer();

  // Start the task.enriched consumer asynchronously — if it fails, the HTTP
  // server still starts and serves requests normally. Enrichment is additive.
  startEnrichmentConsumer().catch((err) =>
    console.error('[startup] enrichment consumer failed:', err),
  );

  app.listen(PORT, () => {
    console.log(`Task Service running on port ${PORT}`);
  });
}

start();
