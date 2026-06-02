import { Kafka, Consumer } from 'kafkajs';
import { enrichTask } from '../claude/enrichment';
import { connectProducer, publishEnriched } from './producer';
import { TaskCreatedEvent } from '../types/ai.types';

const kafka = new Kafka({
  clientId: 'ai-service-consumer',
  brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
});

let consumer: Consumer;

// WHY groupId 'ai-enrichment-group':
//
// All consumer groups receive the same Kafka messages independently.
// 'notification-group' (notification-service) and 'ai-enrichment-group' (this service)
// both consume task.created — each group gets its own copy of every message.
// Kafka guarantees each partition is consumed by exactly one member WITHIN a group,
// so if we ever scale ai-service to multiple instances they share the load without
// duplicating enrichment calls.
export async function startConsumer(): Promise<void> {
  await connectProducer();

  consumer = kafka.consumer({ groupId: 'ai-enrichment-group' });
  await consumer.connect();
  console.log('[kafka] ai-service consumer connected, groupId=ai-enrichment-group');

  await consumer.subscribe({ topics: ['task.created'], fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;

      const event = JSON.parse(message.value.toString()) as TaskCreatedEvent;
      const { taskId, projectId, userId: createdBy, task } = event;

      console.log(`[ai] enriching task ${taskId}: "${task.title}"`);

      // WHY we don't await in a way that blocks the next message:
      // eachMessage is processed sequentially per partition by default in KafkaJS.
      // The Claude API call (200-500ms) would stall all subsequent messages on this
      // partition. We await it here because enrichment is fast enough and we want
      // errors to be catchable per-message, but this is a known trade-off.
      // Production alternative: use a worker pool or eachBatch with concurrency control.
      if (process.env.AI_ENRICHMENT_ENABLED !== 'true') {
        console.log(`[ai] enrichment disabled — skipping task ${taskId}`);
        return;
      }

      try {
        const enrichment = await enrichTask(task.title);

        await publishEnriched({
          taskId,
          projectId,
          createdBy,
          ...enrichment,
        });

        console.log(`[ai] task ${taskId} enriched — priority: ${enrichment.aiPriority}, effort: ${enrichment.aiEffort}`);
      } catch (err) {
        // Enrichment failure must never crash the consumer loop.
        // The task already exists in the DB — this is a best-effort enhancement.
        console.error(`[ai] enrichment failed for task ${taskId}:`, err);
      }
    },
  });
}

export async function stopConsumer(): Promise<void> {
  if (consumer) await consumer.disconnect();
}
