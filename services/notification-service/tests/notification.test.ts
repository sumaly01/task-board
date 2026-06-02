import request from 'supertest';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import app from '../src/app';

// Shared mutable refs so individual tests can control the mock behaviour.
let mockRedisMessageHandler: ((channel: string, message: string) => void) | null = null;
let mockRedisSubscribeHandler: ((err: Error | null) => void) | null = null;

// Isolate tests from real infrastructure.
jest.mock('../src/lib/redis', () => ({
  __esModule: true,
  redisPublisher: { publish: jest.fn(), on: jest.fn() },
  redisSubscriber: {
    subscribe: jest.fn((_channel: string, cb: (err: Error | null) => void) => {
      mockRedisSubscribeHandler = cb;
    }),
    on: jest.fn((event: string, handler: (channel: string, message: string) => void) => {
      if (event === 'message') mockRedisMessageHandler = handler;
    }),
  },
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
//
// WHY extract eachMessage in beforeAll:
//   The `new Kafka(...)` constructor is called once at module import time (module
//   scope), not inside startConsumer(). After jest.clearAllMocks() the mock
//   tracking is wiped, making Kafka.mock.results[0] undefined in subsequent tests.
//   Capturing eachMessage once in beforeAll avoids this: we call startConsumer()
//   exactly once, grab the callback, then reuse it across all Kafka tests.

describe('Kafka consumer — Redis publish', () => {
  type EachMessageFn = (args: { topic: string; message: { value: Buffer } }) => Promise<void>;
  let eachMessage: EachMessageFn;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  let redisPublisher: { publish: jest.Mock };

  beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    redisPublisher = (require('../src/lib/redis') as { redisPublisher: { publish: jest.Mock } }).redisPublisher;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { startConsumer } = require('../src/kafka/consumer') as { startConsumer: () => Promise<void> };
    await startConsumer();

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Kafka } = require('kafkajs') as { Kafka: jest.Mock };
    const consumerInstance = Kafka.mock.results[0].value.consumer.mock.results[0].value;
    const runCall = consumerInstance.run.mock.calls[0][0] as { eachMessage: EachMessageFn };
    eachMessage = runCall.eachMessage;
  });

  beforeEach(() => {
    redisPublisher.publish.mockClear();
  });

  it('publishes to Redis notifications channel on task.created event', async () => {
    const taskPayload = {
      taskId: 'task-1',
      projectId: 'proj-1',
      userId: 'user-1',
      task: { assigneeId: 'assignee-1', id: 'task-1', title: 'Fix bug' },
    };

    await eachMessage({
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

  it('skips self-notification when assignee === creator', async () => {
    // Admin creates a task and self-assigns it (assigneeId === userId)
    const selfAssignedPayload = {
      taskId: 'task-2',
      projectId: 'proj-1',
      userId: 'admin-1',
      task: { assigneeId: 'admin-1', id: 'task-2', title: 'Admin self-task' },
    };

    await eachMessage({
      topic: 'task.created',
      message: { value: Buffer.from(JSON.stringify(selfAssignedPayload)) },
    });

    // No Redis publish — self-notifications are suppressed.
    expect(redisPublisher.publish).not.toHaveBeenCalled();
  });

  it('publishes TASK_UPDATED notification on task.updated event', async () => {
    const updatePayload = {
      taskId: 'task-3',
      projectId: 'proj-1',
      userId: 'admin-1',
      task: { assigneeId: 'member-1', id: 'task-3', title: 'Updated task' },
    };

    await eachMessage({
      topic: 'task.updated',
      message: { value: Buffer.from(JSON.stringify(updatePayload)) },
    });

    expect(redisPublisher.publish).toHaveBeenCalledWith(
      'notifications',
      expect.stringContaining('"type":"TASK_UPDATED"'),
    );
    expect(redisPublisher.publish).toHaveBeenCalledWith(
      'notifications',
      expect.stringContaining('"userId":"member-1"'),
    );
  });
});

// ── Socket.io delivery — end-to-end (within process) ─────────────────────────
//
// WHY test socket delivery here:
//   The Kafka consumer test verifies the Redis publish step.
//   This test verifies the other half: that the socket server reads the Redis
//   message and delivers it to the correct connected client.
//
//   Flow under test:
//     Redis 'message' event → socket server → io.to(socketId).emit('notification')
//
//   We skip the real Redis by triggering mockRedisMessageHandler directly.
//   This simulates what happens when the Kafka consumer publishes to Redis and
//   Redis relays it to the subscriber in the notification service.

describe('Socket.io server — notification delivery', () => {
  let httpServer: http.Server;
  let io: SocketServer;
  let clientSocket: ClientSocket;
  let port: number;

  beforeAll((done) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createSocketServer } = require('../src/socket/server') as {
      createSocketServer: (server: http.Server) => SocketServer;
    };

    httpServer = http.createServer(app);
    io = createSocketServer(httpServer);

    // Port 0 lets the OS pick a free port — avoids conflicts in parallel test runs.
    httpServer.listen(0, () => {
      const addr = httpServer.address();
      port = typeof addr === 'object' && addr ? addr.port : 0;
      done();
    });
  });

  afterAll((done) => {
    if (clientSocket?.connected) clientSocket.disconnect();
    io.close();
    httpServer.close(done);
  });

  it('delivers notification to the registered user socket', (done) => {
    clientSocket = ioc(`http://localhost:${port}`);

    clientSocket.on('connect', () => {
      // Register this socket as belonging to 'test-member-id'
      clientSocket.emit('register', 'test-member-id');
    });

    clientSocket.on('registered', () => {
      // Now simulate a Redis 'message' event arriving (as if Kafka consumer published it)
      const notification = {
        userId: 'test-member-id',
        type: 'TASK_CREATED',
        taskId: 'task-99',
        projectId: 'proj-1',
        message: 'A new task has been assigned to you',
      };

      if (mockRedisMessageHandler) {
        mockRedisMessageHandler('notifications', JSON.stringify(notification));
      }
    });

    clientSocket.on('notification', (payload: { type: string; taskId: string }) => {
      expect(payload.type).toBe('TASK_CREATED');
      expect(payload.taskId).toBe('task-99');
      done();
    });
  });

  it('does NOT deliver notification to a different user', (done) => {
    // Connect a client registered as 'other-user'
    const otherClient = ioc(`http://localhost:${port}`);
    let notificationReceived = false;

    otherClient.on('connect', () => {
      otherClient.emit('register', 'other-user');
    });

    otherClient.on('registered', () => {
      const notification = {
        userId: 'completely-different-user',
        type: 'TASK_CREATED',
        taskId: 'task-100',
        projectId: 'proj-1',
        message: 'A new task has been assigned to you',
      };

      if (mockRedisMessageHandler) {
        mockRedisMessageHandler('notifications', JSON.stringify(notification));
      }

      // Wait briefly then verify no notification was delivered
      setTimeout(() => {
        expect(notificationReceived).toBe(false);
        otherClient.disconnect();
        done();
      }, 100);
    });

    otherClient.on('notification', () => {
      notificationReceived = true;
    });
  });
});
