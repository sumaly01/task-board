import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';

// Mock Redis so tests run without a real Redis instance.
// The blacklist check (redis.exists) and rate limiter (zremrangebyscore, zcard,
// zadd, expire) all go through this mock.
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
// The proxy just calls next() — tests verify gateway behaviour (JWT, rate limit)
// without needing upstream services running.
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
// These tests hit /tasks (a protected route). The proxy mock calls next() so
// tests reach the JWT middleware without needing a real task-service.

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
    mockedRedis.exists.mockResolvedValue(1); // jti is in the blacklist
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
    // Proxy mock calls next() — Express returns 404 for unhandled route,
    // but status is NOT 401 which confirms JWT passed.
    expect(res.status).not.toBe(401);
  });
});

// ── Rate limiting ─────────────────────────────────────────────────────────────

describe('Rate limiting', () => {
  it('returns 429 when request count exceeds limit', async () => {
    mockedRedis.zcard.mockResolvedValue(100); // already at the limit
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
    // userRateLimiter builds key `ratelimit:user:user-42`
    expect(mockedRedis.zadd).toHaveBeenCalledWith(
      'ratelimit:user:user-42',
      expect.any(Number),
      expect.any(String),
    );
  });
});
