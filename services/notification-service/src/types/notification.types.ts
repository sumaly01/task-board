// Shapes of messages published by task-service to Kafka topics:
// task.created, task.updated, task.deleted

export interface TaskEvent {
  taskId: string;
  projectId: string;
  userId: string; // the user who triggered the action
  assigneeId?: string; // present on task.deleted events
  task?: Record<string, unknown>; // full task object on created/updated events
}

// Shape of messages published to the Redis `notifications` channel.
// All notification-service instances subscribe to this channel; only the
// instance holding the target user's socket delivers the notification.
export interface NotificationPayload {
  userId: string; // who to deliver to
  type: 'TASK_CREATED' | 'TASK_UPDATED' | 'TASK_DELETED' | 'TASK_REMINDER' | 'TASK_AI_ENRICHED';
  taskId: string;
  projectId: string;
  message: string;
  task?: Record<string, unknown>;
}

// Shape of the task.ai_enriched Kafka event produced by task-service.
// Only notification-service consumes this — used to emit a Socket.io notification
// to the admin who created the task so the AI badge appears without a page refresh.
export interface TaskAiEnrichedEvent {
  taskId: string;
  projectId: string;
  createdBy: string; // the admin to notify — NOT the assignee
  task: Record<string, unknown>; // full updated task including AI fields
}
