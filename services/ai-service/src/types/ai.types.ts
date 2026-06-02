// Shape of the task.created Kafka event produced by task-service.
// ai-service consumes this and passes the title + projectId to Claude.
export interface TaskCreatedEvent {
  taskId: string;
  projectId: string;
  userId: string; // the admin who created the task — forwarded as createdBy in task.enriched
  task: {
    id: string;
    title: string;
    description: string | null;
    priority: string;
    projectId: string;
    assigneeId: string;
    createdBy: string;
  };
  timestamp: string;
}

// Claude tool use output — the structured enrichment data.
// This maps directly to the tool's input_schema defined in enrichment.ts.
export interface EnrichmentResult {
  aiDescription: string;
  aiPriority: 'LOW' | 'MEDIUM' | 'HIGH';
  aiEffort: 'XS' | 'S' | 'M' | 'L' | 'XL';
  aiTags: string[];
}

// Shape of the task.enriched Kafka event produced by ai-service.
// task-service consumes this and writes the AI fields to the DB.
export interface TaskEnrichedEvent {
  taskId: string;
  projectId: string;
  createdBy: string; // forwarded from task.created event — used by notification-service to target the admin
  aiDescription: string;
  aiPriority: 'LOW' | 'MEDIUM' | 'HIGH';
  aiEffort: 'XS' | 'S' | 'M' | 'L' | 'XL';
  aiTags: string[];
  timestamp: string;
}
