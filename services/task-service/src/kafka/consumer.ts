import { Kafka, Consumer } from 'kafkajs';
import { applyAiEnrichment } from '../services/task.service';
import { AiEnrichmentData } from '../types/task.types';

const kafka = new Kafka({
  clientId: 'task-service-consumer',
  brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
});

let consumer: Consumer;

// WHY task-service has both a Kafka producer AND a consumer:
//
// Task-service has always been a Kafka producer (task.created, task.updated, etc.).
// Adding a consumer here makes it a full participant in the event-driven loop:
//
//   ai-service publishes task.enriched
//       ↓
//   task-service consumes task.enriched → writes AI fields to DB → publishes task.ai_enriched
//       ↓
//   notification-service consumes task.ai_enriched → Socket.io to admin
//
// The groupId 'task-enrichment-consumer' is distinct from 'notification-group' and
// 'ai-enrichment-group'. Each group receives an independent copy of every Kafka
// message — they don't share or compete for messages.
export async function startEnrichmentConsumer(): Promise<void> {
  consumer = kafka.consumer({ groupId: 'task-enrichment-consumer' });

  try {
    await consumer.connect();
    console.log('[kafka] task-service enrichment consumer connected');

    await consumer.subscribe({ topics: ['task.enriched'], fromBeginning: false });

    await consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;

        const event = JSON.parse(message.value.toString()) as AiEnrichmentData;

        console.log(`[kafka] task.enriched received for task ${event.taskId}`);

        await applyAiEnrichment(event);
      },
    });
  } catch (err) {
    // Non-fatal: enrichment is a best-effort feature. If this consumer fails to
    // start, the core task CRUD still works. Log and let the service continue.
    console.error('[kafka] task enrichment consumer failed to start:', err);
  }
}

export async function stopEnrichmentConsumer(): Promise<void> {
  if (consumer) await consumer.disconnect();
}
