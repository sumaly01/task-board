import request from 'supertest';
import app from '../src/app';

// Isolate tests from real infrastructure.
jest.mock('../src/lib/redis', () => ({
  __esModule: true,
  redisPublisher: { publish: jest.fn(), on: jest.fn() },
  redisSubscriber: { subscribe: jest.fn(), on: jest.fn() },
}));

jest.mock('../src/lib/prisma', () => ({
  __esModule: true,
  default: { task: { findMany: jest.fn(), update: jest.fn() } },
}));

jest.mock('kafkajs', () => ({
  Kafka: jest.fn().mockImplementation(() => ({
    consumer: jest.fn().mockReturnValue({
      connect: jest.fn(),
      subscribe: jest.fn(),
      run: jest.fn(),
      disconnect: jest.fn(),
    }),
  })),
}));

// ── /health ───────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with service name', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'notification-service' });
  });
});

// ── Kafka consumer logic ───────────────────────────────────────────────────────

describe('Kafka consumer — Redis publish', () => {
  it('publishes to Redis notifications channel on task.created event', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { redisPublisher } = require('../src/lib/redis') as {
      redisPublisher: { publish: jest.Mock };
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { startConsumer } = require('../src/kafka/consumer') as {
      startConsumer: () => Promise<void>;
    };

    await startConsumer();

    // Simulate eachMessage being called by extracting the run callback.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Kafka } = require('kafkajs') as { Kafka: jest.Mock };
    const consumerInstance = Kafka.mock.results[0].value.consumer.mock.results[0].value;
    const runCall = consumerInstance.run.mock.calls[0][0] as {
      eachMessage: (args: {
        topic: string;
        message: { value: Buffer };
      }) => Promise<void>;
    };

    const taskPayload = {
      taskId: 'task-1',
      projectId: 'proj-1',
      userId: 'user-1',
      task: { assigneeId: 'assignee-1', id: 'task-1', title: 'Fix bug' },
    };

    await runCall.eachMessage({
      topic: 'task.created',
      message: { value: Buffer.from(JSON.stringify(taskPayload)) },
    });

    expect(redisPublisher.publish).toHaveBeenCalledWith(
      'notifications',
      expect.stringContaining('"type":"TASK_CREATED"'),
    );
    expect(redisPublisher.publish).toHaveBeenCalledWith(
      'notifications',
      expect.stringContaining('"userId":"assignee-1"'),
    );
  });
});
