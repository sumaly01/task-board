import http from 'http';
import app from './app';
import { createSocketServer } from './socket/server';
import { startConsumer } from './kafka/consumer';
import { startReminderCron } from './cron/reminder.cron';

const PORT = Number(process.env.PORT) || 4003;

async function main() {
  // Wrap the Express app in a plain HTTP server so Socket.io can attach to it.
  // Both share the same port — HTTP requests go to Express, WebSocket upgrades
  // go to Socket.io. The HTTP server handles the upgrade handshake transparently.
  const httpServer = http.createServer(app);

  createSocketServer(httpServer);

  // Kafka consumer startup is non-fatal: if Kafka is not ready (e.g. docker-compose
  // startup race), we log the error and continue. The service still serves health
  // checks and WebSocket connections. Kafka can be retried manually if needed.
  try {
    await startConsumer();
  } catch (err) {
    console.error('[kafka] failed to start consumer — service continues without Kafka:', err);
  }

  startReminderCron();

  httpServer.listen(PORT, () => {
    console.log(`Notification Service running on port ${PORT}`);
  });
}

main().catch(console.error);
