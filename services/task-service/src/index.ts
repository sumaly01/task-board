import app from './app';
import { connectProducer } from './kafka/producer';

const PORT = Number(process.env.PORT) || 4002;

async function start() {
  await connectProducer();
  app.listen(PORT, () => {
    console.log(`Task Service running on port ${PORT}`);
  });
}

start();
