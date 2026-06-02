import request from 'supertest';
import app from '../src/app';
import * as projectRepo from '../src/repositories/project.repository';
import * as taskRepo from '../src/repositories/task.repository';
import * as taskCache from '../src/cache/task.cache';
import * as kafkaProducer from '../src/kafka/producer';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../src/repositories/project.repository');
jest.mock('../src/repositories/task.repository');

jest.mock('../src/cache/task.cache', () => ({
  getCachedTasks: jest.fn(),
  setCachedTasks: jest.fn(),
  invalidateTaskCache: jest.fn(),
}));

jest.mock('../src/kafka/producer', () => ({
  connectProducer: jest.fn().mockResolvedValue(undefined),
  publishEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/lib/redis', () => ({
  __esModule: true,
  default: { get: jest.fn(), set: jest.fn(), del: jest.fn(), keys: jest.fn().mockResolvedValue([]), on: jest.fn() },
}));

// Default auth mock injects an ADMIN user — individual tests can override this
// by mocking a different implementation for the specific test.
// Simulates exactly what the API Gateway does: inject x-user-* headers.
jest.mock('../src/middleware/auth.middleware', () => ({
  // jest.fn() is required so individual tests can call mockImplementationOnce
  // to simulate a MEMBER caller without affecting the default ADMIN behaviour.
  requireAuth: jest.fn((req: any, _res: any, next: any) => {
    req.user = { userId: 'admin-user-id', email: 'admin@example.com', role: 'ADMIN' };
    next();
  }),
}));

const mockedProjectRepo = projectRepo as jest.Mocked<typeof projectRepo>;
const mockedTaskRepo = taskRepo as jest.Mocked<typeof taskRepo>;
const mockedCache = taskCache as jest.Mocked<typeof taskCache>;
const mockedKafka = kafkaProducer as jest.Mocked<typeof kafkaProducer>;

// ── Fixtures ─────────────────────────────────────────────────────────────────

const mockProject = {
  id: 'project-uuid-1',
  name: 'Test Project',
  ownerId: 'admin-user-id',
  createdAt: new Date(),
};

const mockProjectWithTasks = { ...mockProject, tasks: [] };

const mockTask = {
  id: 'task-uuid-1',
  title: 'Test Task',
  description: 'A test task',
  status: 'TODO' as const,
  priority: 'MEDIUM' as const,
  dueDate: null,
  projectId: 'project-uuid-1',
  assigneeId: 'member-user-id',
  createdBy: 'admin-user-id',
  reminderSent: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockTaskOwnedByMember = { ...mockTask, assigneeId: 'member-user-id' };
const mockTaskOwnedByOther = { ...mockTask, id: 'task-uuid-2', assigneeId: 'other-member-id' };

beforeEach(() => {
  jest.clearAllMocks();
});

// ── POST /projects ────────────────────────────────────────────────────────────

describe('POST /projects', () => {
  it('returns 201 with the new project', async () => {
    mockedProjectRepo.createProject.mockResolvedValue(mockProject);

    const res = await request(app).post('/projects').send({ name: 'Test Project' });

    expect(res.status).toBe(201);
    expect(res.body.project.name).toBe('Test Project');
    expect(mockedProjectRepo.createProject).toHaveBeenCalledWith({
      name: 'Test Project',
      ownerId: 'admin-user-id',
    });
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app).post('/projects').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Project name is required');
  });
});

// ── GET /projects ─────────────────────────────────────────────────────────────

describe('GET /projects — role scoping', () => {
  it('ADMIN: calls findAllProjects and returns all projects', async () => {
    mockedProjectRepo.findAllProjects.mockResolvedValue([mockProject]);

    const res = await request(app).get('/projects');

    expect(res.status).toBe(200);
    expect(res.body.projects).toHaveLength(1);
    // ADMIN path uses findAllProjects, not findProjectsByOwner
    expect(mockedProjectRepo.findAllProjects).toHaveBeenCalled();
    expect(mockedProjectRepo.findProjectsByOwner).not.toHaveBeenCalled();
  });

  it('MEMBER: calls findProjectsForMember scoped to their userId', async () => {
    // Override auth to simulate a MEMBER caller
    const { requireAuth } = require('../src/middleware/auth.middleware');
    requireAuth.mockImplementationOnce((req: any, _res: any, next: any) => {
      req.user = { userId: 'member-user-id', email: 'member@example.com', role: 'MEMBER' };
      next();
    });

    mockedProjectRepo.findProjectsForMember.mockResolvedValue([mockProject]);

    const res = await request(app).get('/projects');

    expect(res.status).toBe(200);
    // MEMBER path uses findProjectsForMember
    expect(mockedProjectRepo.findProjectsForMember).toHaveBeenCalledWith('member-user-id');
    expect(mockedProjectRepo.findAllProjects).not.toHaveBeenCalled();
  });
});

// ── GET /projects/:id ─────────────────────────────────────────────────────────

describe('GET /projects/:id', () => {
  it('returns 200 with the project and its tasks', async () => {
    mockedProjectRepo.findProjectById.mockResolvedValue(mockProjectWithTasks);

    const res = await request(app).get('/projects/project-uuid-1');

    expect(res.status).toBe(200);
    expect(res.body.project.id).toBe('project-uuid-1');
  });

  it('returns 404 when project does not exist', async () => {
    mockedProjectRepo.findProjectById.mockResolvedValue(null);

    const res = await request(app).get('/projects/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Project not found');
  });
});

// ── POST /tasks ───────────────────────────────────────────────────────────────

describe('POST /tasks', () => {
  it('returns 201, invalidates cache, and fires task.created Kafka event', async () => {
    mockedProjectRepo.findProjectById.mockResolvedValue(mockProjectWithTasks);
    mockedTaskRepo.createTask.mockResolvedValue(mockTask);
    mockedCache.invalidateTaskCache.mockResolvedValue(undefined);
    mockedKafka.publishEvent.mockResolvedValue(undefined);

    const res = await request(app).post('/tasks').send({
      title: 'Test Task',
      projectId: 'project-uuid-1',
      assigneeId: 'member-user-id',
    });

    expect(res.status).toBe(201);
    expect(res.body.task.title).toBe('Test Task');
    expect(mockedCache.invalidateTaskCache).toHaveBeenCalledWith('project-uuid-1');
    expect(mockedKafka.publishEvent).toHaveBeenCalledWith(
      'task.created',
      expect.objectContaining({ taskId: mockTask.id, projectId: 'project-uuid-1' }),
    );
  });

  it('returns 400 when title is missing', async () => {
    const res = await request(app)
      .post('/tasks')
      .send({ projectId: 'project-uuid-1', assigneeId: 'member-user-id' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Task title is required');
  });

  it('returns 404 when projectId does not exist', async () => {
    mockedProjectRepo.findProjectById.mockResolvedValue(null);

    const res = await request(app)
      .post('/tasks')
      .send({ title: 'Test', projectId: 'bad-id', assigneeId: 'member-user-id' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Project not found');
  });
});

// ── GET /tasks?projectId= — role scoping (Day 7 RBAC) ────────────────────────
//
// WHY test role scoping here (in addition to gateway tests):
//   The gateway tests verify the 403 enforcement. These tests verify the DATA
//   returned is correctly scoped — that a MEMBER only receives their own tasks
//   even though the request was allowed through the gateway.

describe('GET /tasks?projectId= — role scoping', () => {
  it('returns 400 when projectId query param is missing', async () => {
    const res = await request(app).get('/tasks');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('projectId query parameter is required');
  });

  it('ADMIN: returns all tasks from DB on cache MISS', async () => {
    mockedCache.getCachedTasks.mockResolvedValue(null);
    mockedTaskRepo.findTasksByProject.mockResolvedValue([mockTask, mockTaskOwnedByOther]);
    mockedCache.setCachedTasks.mockResolvedValue(undefined);

    const res = await request(app).get('/tasks?projectId=project-uuid-1');

    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(2);
    // ADMIN path uses findTasksByProject (all tasks)
    expect(mockedTaskRepo.findTasksByProject).toHaveBeenCalledWith('project-uuid-1');
    expect(mockedTaskRepo.findTasksByProjectAndAssignee).not.toHaveBeenCalled();
  });

  it('ADMIN: returns tasks from Redis cache on cache HIT and skips the DB', async () => {
    mockedCache.getCachedTasks.mockResolvedValue([mockTask]);

    const res = await request(app).get('/tasks?projectId=project-uuid-1');

    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(1);
    expect(mockedTaskRepo.findTasksByProject).not.toHaveBeenCalled();
  });

  it('MEMBER: returns only their own tasks (findTasksByProjectAndAssignee)', async () => {
    // Override auth to simulate a MEMBER caller
    const { requireAuth } = require('../src/middleware/auth.middleware');
    requireAuth.mockImplementationOnce((req: any, _res: any, next: any) => {
      req.user = { userId: 'member-user-id', email: 'member@example.com', role: 'MEMBER' };
      next();
    });

    mockedCache.getCachedTasks.mockResolvedValue(null);
    // DB returns only the member's assigned task
    mockedTaskRepo.findTasksByProjectAndAssignee.mockResolvedValue([mockTaskOwnedByMember]);
    mockedCache.setCachedTasks.mockResolvedValue(undefined);

    const res = await request(app).get('/tasks?projectId=project-uuid-1');

    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.tasks[0].assigneeId).toBe('member-user-id');
    // MEMBER path uses findTasksByProjectAndAssignee, not findTasksByProject
    expect(mockedTaskRepo.findTasksByProjectAndAssignee).toHaveBeenCalledWith(
      'project-uuid-1',
      'member-user-id',
    );
    expect(mockedTaskRepo.findTasksByProject).not.toHaveBeenCalled();
  });
});

// ── GET /tasks/:id ────────────────────────────────────────────────────────────

describe('GET /tasks/:id', () => {
  it('returns 200 with the task', async () => {
    mockedTaskRepo.findTaskById.mockResolvedValue(mockTask);

    const res = await request(app).get('/tasks/task-uuid-1');

    expect(res.status).toBe(200);
    expect(res.body.task.id).toBe('task-uuid-1');
  });

  it('returns 404 when task does not exist', async () => {
    mockedTaskRepo.findTaskById.mockResolvedValue(null);

    const res = await request(app).get('/tasks/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Task not found');
  });
});

// ── PATCH /tasks/:id ─────────────────────────────────────────────────────────

describe('PATCH /tasks/:id', () => {
  it('returns 200, invalidates cache, and fires task.updated Kafka event', async () => {
    const updatedTask = { ...mockTask, title: 'Updated Title' };
    mockedTaskRepo.findTaskById.mockResolvedValue(mockTask);
    mockedTaskRepo.updateTask.mockResolvedValue(updatedTask);
    mockedCache.invalidateTaskCache.mockResolvedValue(undefined);

    const res = await request(app).patch('/tasks/task-uuid-1').send({ title: 'Updated Title' });

    expect(res.status).toBe(200);
    expect(res.body.task.title).toBe('Updated Title');
    expect(mockedCache.invalidateTaskCache).toHaveBeenCalledWith(mockTask.projectId);
    expect(mockedKafka.publishEvent).toHaveBeenCalledWith(
      'task.updated',
      expect.objectContaining({ taskId: updatedTask.id }),
    );
  });

  it('returns 404 when task does not exist', async () => {
    mockedTaskRepo.findTaskById.mockResolvedValue(null);

    const res = await request(app).patch('/tasks/nonexistent').send({ title: 'x' });

    expect(res.status).toBe(404);
  });
});

// ── PATCH /tasks/:id/status ───────────────────────────────────────────────────

describe('PATCH /tasks/:id/status', () => {
  it('returns 200 with the updated status', async () => {
    const updatedTask = { ...mockTask, status: 'DONE' as const };
    mockedTaskRepo.findTaskById.mockResolvedValue(mockTask);
    mockedTaskRepo.updateTaskStatus.mockResolvedValue(updatedTask);
    mockedCache.invalidateTaskCache.mockResolvedValue(undefined);

    const res = await request(app)
      .patch('/tasks/task-uuid-1/status')
      .send({ status: 'DONE' });

    expect(res.status).toBe(200);
    expect(res.body.task.status).toBe('DONE');
    expect(mockedCache.invalidateTaskCache).toHaveBeenCalledWith(mockTask.projectId);
  });

  it('returns 400 for an invalid status value', async () => {
    mockedTaskRepo.findTaskById.mockResolvedValue(mockTask);

    const res = await request(app)
      .patch('/tasks/task-uuid-1/status')
      .send({ status: 'FLYING' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/status must be one of/);
  });
});

// ── DELETE /tasks/:id ─────────────────────────────────────────────────────────

describe('DELETE /tasks/:id', () => {
  it('returns 204, invalidates cache, and fires task.deleted Kafka event', async () => {
    mockedTaskRepo.findTaskById.mockResolvedValue(mockTask);
    mockedTaskRepo.deleteTask.mockResolvedValue(mockTask);
    mockedCache.invalidateTaskCache.mockResolvedValue(undefined);

    const res = await request(app).delete('/tasks/task-uuid-1');

    expect(res.status).toBe(204);
    expect(mockedCache.invalidateTaskCache).toHaveBeenCalledWith(mockTask.projectId);
    expect(mockedKafka.publishEvent).toHaveBeenCalledWith(
      'task.deleted',
      expect.objectContaining({ taskId: 'task-uuid-1' }),
    );
  });

  it('returns 404 when task does not exist', async () => {
    mockedTaskRepo.findTaskById.mockResolvedValue(null);

    const res = await request(app).delete('/tasks/nonexistent');

    expect(res.status).toBe(404);
  });
});
