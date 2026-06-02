import { Kafka, Producer } from 'kafkajs';
import { TaskEnrichedEvent } from '../types/ai.types';

const kafka = new Kafka({
  clientId: 'ai-service',
  brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
});

const producer: Producer = kafka.producer();

export async function connectProducer(): Promise<void> {
  await producer.connect();
  console.log('[kafka] ai-service producer connected');
}

// Publishes task.enriched — consumed by task-service to write AI fields to the DB.
// The event includes createdBy so task-service can forward it in task.ai_enriched
// for the notification-service to know which admin to notify.
export async function publishEnriched(event: Omit<TaskEnrichedEvent, 'timestamp'>): Promise<void> {
  try {
    await producer.send({
      topic: 'task.enriched',
      messages: [
        {
          value: JSON.stringify({ ...event, timestamp: new Date().toISOString() }),
        },
      ],
    });
    console.log(`[kafka] task.enriched published for task ${event.taskId}`);
  } catch (err) {
    console.error('[kafka] failed to publish task.enriched:', err);
  }
}
