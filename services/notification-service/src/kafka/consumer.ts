import { Kafka, Consumer } from 'kafkajs';
import { redisPublisher } from '../lib/redis';
import { TaskEvent, NotificationPayload } from '../types/notification.types';

const kafka = new Kafka({
  clientId: 'notification-service',
  brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
});

let consumer: Consumer;

// The groupId is critical for scaling.
//
// All instances of notification-service share groupId 'notification-group'.
// Kafka guarantees each message partition is consumed by exactly ONE member
// of the group — so creating a task triggers exactly one notification, not
// one per running instance.
//
// If each instance used a unique groupId (e.g. 'notification-' + uuid()),
// every instance would receive every message, causing duplicate notifications
// for every task event.
export async function startConsumer(): Promise<void> {
  consumer = kafka.consumer({ groupId: 'notification-group' });

  await consumer.connect();
  console.log('[kafka] consumer connected, groupId=notification-group');

  await consumer.subscribe({ topics: ['task.created', 'task.updated', 'task.deleted'] });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return;

      const event = JSON.parse(message.value.toString()) as TaskEvent;

      const typeMap: Record<string, NotificationPayload['type']> = {
        'task.created': 'TASK_CREATED',
        'task.updated': 'TASK_UPDATED',
        'task.deleted': 'TASK_DELETED',
      };

      const messageMap: Record<string, string> = {
        'task.created': 'A new task has been assigned to you',
        'task.updated': 'A task assigned to you has been updated',
        'task.deleted': 'A task has been deleted',
      };

      // For created/updated events, notify the assignee.
      // For deleted events, the full task is not available so we notify the
      // actor (userId) as a fallback.
      const taskData = event.task as { assigneeId?: string } | undefined;
      const targetUserId = taskData?.assigneeId ?? event.assigneeId ?? event.userId;

      const payload: NotificationPayload = {
        userId: targetUserId,
        type: typeMap[topic],
        taskId: event.taskId,
        projectId: event.projectId,
        message: messageMap[topic],
        task: event.task,
      };

      // Publish to the shared Redis channel instead of emitting to a socket directly.
      // Reason: this Kafka consumer runs on one instance, but the target user's
      // socket may be connected to a different instance. Publishing to Redis
      // fan-outs to all instances; only the one holding that socket delivers it.
      await redisPublisher.publish('notifications', JSON.stringify(payload));

      console.log(`[kafka] ${topic} → Redis notification for user ${targetUserId}`);
    },
  });
}

export async function stopConsumer(): Promise<void> {
  if (consumer) await consumer.disconnect();
}
