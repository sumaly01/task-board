import { Kafka, Producer } from 'kafkajs';

// Kafka producer — publishes task.created, task.updated, task.deleted events.
// The Notification Service (Day 4) consumes these topics.
// Why a producer here and consumer elsewhere: the task-service EMITS events
// about things that happened. The notification-service REACTS to those events.
// Separating them means either service can be scaled, restarted, or changed
// without affecting the other. Kafka acts as the durable buffer between them.
const kafka = new Kafka({
  clientId: 'task-service',
  brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
});

const producer: Producer = kafka.producer();

export async function connectProducer(): Promise<void> {
  try {
    await producer.connect();
    console.log('Kafka producer connected');
  } catch (err) {
    // Don't crash if Kafka is unavailable — events are best-effort in development.
    console.error('Kafka producer connection failed (events will not fire):', err);
  }
}

export async function publishEvent(
  topic: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await producer.send({
      topic,
      messages: [{ value: JSON.stringify({ ...payload, timestamp: new Date().toISOString() }) }],
    });
  } catch (err) {
    console.error(`Failed to publish to ${topic}:`, err);
  }
}

export default producer;
