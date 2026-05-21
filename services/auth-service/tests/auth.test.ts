import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import * as userRepo from '../src/repositories/user.repository';
import redis from '../src/lib/redis';

// Mock the repository so tests never touch a real database
jest.mock('../src/repositories/user.repository');

// Mock Redis so tests never need a running Redis instance
jest.mock('../src/lib/redis', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    on: jest.fn(),
  },
}));

const mockedRepo = userRepo as jest.Mocked<typeof userRepo>;
const mockedRedis = redis as unknown as { get: jest.Mock; set: jest.Mock; del: jest.Mock };

const TEST_JWT_SECRET = 'test_jwt_secret';
const TEST_REFRESH_SECRET = 'test_refresh_secret';

const mockUser = {
  id: 'user-uuid-1',
  email: 'test@example.com',
  name: 'Test User',
  password: '',
  role: 'MEMBER' as const,
  createdAt: new Date(),
};

beforeAll(async () => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.JWT_REFRESH_SECRET = TEST_REFRESH_SECRET;
  // Pre-hash a password for reuse across login tests
  mockUser.password = await bcrypt.hash('password123', 10);
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ── POST /auth/register ──────────────────────────────────────────────────────

describe('POST /auth/register', () => {
  it('returns 201 and user object (without password) on success', async () => {
    mockedRepo.findUserByEmail.mockResolvedValue(null);
    mockedRepo.createUser.mockResolvedValue(mockUser);

    const res = await request(app)
      .post('/auth/register')
      .send({ email: mockUser.email, password: 'password123', name: mockUser.name });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(mockUser.email);
    expect(res.body.user.name).toBe(mockUser.name);
    expect(res.body.user.password).toBeUndefined();
  });

  it('returns 409 when email is already registered', async () => {
    mockedRepo.findUserByEmail.mockResolvedValue(mockUser);

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'test@example.com', password: 'password123', name: 'Test User' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Email already registered');
  });
});

// ── POST /auth/login ─────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  it('returns accessToken and refreshToken on valid credentials', async () => {
    mockedRepo.findUserByEmail.mockResolvedValue(mockUser);
    mockedRedis.set.mockResolvedValue('OK');

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
  });

  it('returns 401 for wrong password', async () => {
    mockedRepo.findUserByEmail.mockResolvedValue(mockUser);

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('returns 401 for unknown email', async () => {
    mockedRepo.findUserByEmail.mockResolvedValue(null);

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });
});

// ── POST /auth/refresh ───────────────────────────────────────────────────────

describe('POST /auth/refresh', () => {
  it('returns new token pair when refresh token is valid and in Redis', async () => {
    const refreshToken = jwt.sign({ userId: mockUser.id }, TEST_REFRESH_SECRET, {
      expiresIn: '7d',
    });
    mockedRedis.get.mockResolvedValue(refreshToken);
    mockedRedis.del.mockResolvedValue(1);
    mockedRedis.set.mockResolvedValue('OK');
    mockedRepo.findUserById.mockResolvedValue(mockUser);

    const res = await request(app).post('/auth/refresh').send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
  });

  it('returns 401 when refresh token is not in Redis (already revoked)', async () => {
    const refreshToken = jwt.sign({ userId: mockUser.id }, TEST_REFRESH_SECRET, {
      expiresIn: '7d',
    });
    mockedRedis.get.mockResolvedValue(null);

    const res = await request(app).post('/auth/refresh').send({ refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Refresh token revoked');
  });

  it('returns 401 for a tampered/invalid refresh token', async () => {
    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: 'invalid.token.value' });

    expect(res.status).toBe(401);
  });

  it('returns 400 when refreshToken field is missing', async () => {
    const res = await request(app).post('/auth/refresh').send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('refreshToken is required');
  });
});

// ── POST /auth/logout ────────────────────────────────────────────────────────

describe('POST /auth/logout', () => {
  it('returns 204 and blacklists the token on successful logout', async () => {
    const accessToken = jwt.sign(
      { userId: mockUser.id, email: mockUser.email, role: mockUser.role, jti: 'test-jti-123' },
      TEST_JWT_SECRET,
      { expiresIn: '15m' },
    );
    mockedRedis.set.mockResolvedValue('OK');
    mockedRedis.del.mockResolvedValue(1);

    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(204);
    // Verify the token was blacklisted in Redis
    expect(mockedRedis.set).toHaveBeenCalledWith(
      'blacklist:test-jti-123',
      '1',
      'EX',
      expect.any(Number),
    );
    // Verify the refresh token was deleted from Redis
    expect(mockedRedis.del).toHaveBeenCalledWith(`refresh:${mockUser.id}`);
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app).post('/auth/logout');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authorization header required');
  });

  it('returns 401 for an invalid access token', async () => {
    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', 'Bearer invalid.token.here');

    expect(res.status).toBe(401);
  });
});
