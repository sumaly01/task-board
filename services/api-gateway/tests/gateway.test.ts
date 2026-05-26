import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';

// Mock Redis so tests run without a real Redis instance.
jest.mock('../src/lib/redis', () => ({
  __esModule: true,
  default: {
    exists: jest.fn().mockResolvedValue(0),
    zremrangebyscore: jest.fn().mockResolvedValue(0),
    zcard: jest.fn().mockResolvedValue(0),
    zadd: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    on: jest.fn(),
  },
}));

// Mock http-proxy-middleware so tests never make real outbound HTTP calls.
// The proxy just calls next() — tests verify gateway behaviour without needing upstream services.
jest.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

const JWT_SECRET = 'test-secret';
process.env.JWT_SECRET = JWT_SECRET;
process.env.AUTH_SERVICE_URL = 'http://localhost:4001';
process.env.TASK_SERVICE_URL = 'http://localhost:4002';

function makeToken(payload: object = {}, options: jwt.SignOptions = {}) {
  return jwt.sign(
    { userId: 'user-1', email: 'alice@example.com', role: 'MEMBER', jti: 'jti-1', ...payload },
    JWT_SECRET,
    { expiresIn: '15m', ...options },
  );
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockedRedis = require('../src/lib/redis').default as {
  exists: jest.Mock;
  zremrangebyscore: jest.Mock;
  zcard: jest.Mock;
  zadd: jest.Mock;
  expire: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedRedis.exists.mockResolvedValue(0);
  mockedRedis.zcard.mockResolvedValue(0);
});

// ── /health ───────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with service name', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'api-gateway' });
  });
});

// ── JWT middleware ─────────────────────────────────────────────────────────────

describe('JWT middleware — /tasks', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app).get('/tasks?projectId=abc');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authorization required');
  });

  it('returns 401 when token has invalid signature', async () => {
    const res = await request(app)
      .get('/tasks?projectId=abc')
      .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiIxIn0.wrong');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid or expired token');
  });

  it('returns 401 when token is blacklisted in Redis', async () => {
    mockedRedis.exists.mockResolvedValue(1);
    const token = makeToken({ jti: 'revoked-jti' });
    const res = await request(app)
      .get('/tasks?projectId=abc')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token has been revoked');
    expect(mockedRedis.exists).toHaveBeenCalledWith('blacklist:revoked-jti');
  });

  it('passes through with valid non-blacklisted token', async () => {
    const token = makeToken();
    const res = await request(app)
      .get('/tasks?projectId=abc')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).not.toBe(401);
  });
});

// ── Role guard — RBAC enforcement ─────────────────────────────────────────────
//
// These tests verify that the gateway returns 403 Forbidden when a MEMBER
// attempts to call an ADMIN-only endpoint. This is the Day 7 RBAC feature.
//
// WHY test at the gateway level:
//   The gateway is the enforcement point. If these tests pass, a MEMBER with a
//   valid JWT will be blocked before the request ever reaches task-service.
//   Task-service only needs to scope queries — it can trust that callers on
//   admin-only routes are always ADMIN by the time they arrive.

describe('Role guard — MEMBER cannot call ADMIN-only endpoints', () => {
  function memberToken() {
    return makeToken({ role: 'MEMBER', jti: 'jti-member' });
  }
  function adminToken() {
    return makeToken({ role: 'ADMIN', jti: 'jti-admin' });
  }

  it('returns 403 when MEMBER calls POST /projects', async () => {
    const res = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${memberToken()}`)
      .send({ name: 'Test' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/forbidden/i);
  });

  it('returns 403 when MEMBER calls POST /tasks', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${memberToken()}`)
      .send({ title: 'Test', projectId: 'p1', assigneeId: 'u1' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/forbidden/i);
  });

  it('returns 403 when MEMBER calls DELETE /tasks/:id', async () => {
    const res = await request(app)
      .delete('/tasks/task-uuid-1')
      .set('Authorization', `Bearer ${memberToken()}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/forbidden/i);
  });

  it('returns 403 when MEMBER calls GET /members', async () => {
    const res = await request(app)
      .get('/members')
      .set('Authorization', `Bearer ${memberToken()}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/forbidden/i);
  });

  it('ADMIN can call POST /projects (passes through to proxy)', async () => {
    const res = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Test' });
    // Proxy mock calls next() — not 403, which confirms role guard passed
    expect(res.status).not.toBe(403);
  });

  it('ADMIN can call POST /tasks (passes through to proxy)', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ title: 'Test', projectId: 'p1', assigneeId: 'u1' });
    expect(res.status).not.toBe(403);
  });

  it('ADMIN can call DELETE /tasks/:id (passes through to proxy)', async () => {
    const res = await request(app)
      .delete('/tasks/task-uuid-1')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).not.toBe(403);
  });

  it('ADMIN can call GET /members (passes through to proxy)', async () => {
    const res = await request(app)
      .get('/members')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).not.toBe(403);
  });

  it('MEMBER can still call GET /tasks (read access is allowed)', async () => {
    const res = await request(app)
      .get('/tasks?projectId=abc')
      .set('Authorization', `Bearer ${memberToken()}`);
    // Not blocked by role guard — only query results differ (scoped in task-service)
    expect(res.status).not.toBe(403);
  });

  it('MEMBER can still call PATCH /tasks/:id/status (status update is allowed)', async () => {
    const res = await request(app)
      .patch('/tasks/task-uuid-1/status')
      .set('Authorization', `Bearer ${memberToken()}`)
      .send({ status: 'DONE' });
    expect(res.status).not.toBe(403);
  });
});

// ── Rate limiting ─────────────────────────────────────────────────────────────

describe('Rate limiting', () => {
  it('returns 429 when request count exceeds limit', async () => {
    mockedRedis.zcard.mockResolvedValue(100);
    const res = await request(app).post('/auth/login').send({});
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/too many requests/i);
  });

  it('sets X-RateLimit headers on allowed requests', async () => {
    mockedRedis.zcard.mockResolvedValue(5);
    const res = await request(app).post('/auth/login').send({});
    expect(res.headers['x-ratelimit-limit']).toBe('100');
    expect(res.headers['x-ratelimit-remaining']).toBe('94');
  });

  it('keys user rate limit by userId from JWT', async () => {
    const token = makeToken({ userId: 'user-42' });
    await request(app)
      .get('/tasks?projectId=abc')
      .set('Authorization', `Bearer ${token}`);
    expect(mockedRedis.zadd).toHaveBeenCalledWith(
      'ratelimit:user:user-42',
      expect.any(Number),
      expect.any(String),
    );
  });
});
