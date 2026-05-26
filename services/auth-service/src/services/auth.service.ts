import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { AppError } from '../middleware/error.middleware';
import { findUserByEmail, findUserById, createUser } from '../repositories/user.repository';
import redis from '../lib/redis';
import { RegisterBody, LoginBody, AuthTokens, SafeUser } from '../types/auth.types';

const SALT_ROUNDS = 10;
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

function getSecrets(): { jwtSecret: string; jwtRefreshSecret: string } {
  const jwtSecret = process.env.JWT_SECRET;
  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
  if (!jwtSecret || !jwtRefreshSecret) {
    throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be set');
  }
  return { jwtSecret, jwtRefreshSecret };
}

// Signs a fresh access + refresh token pair for the given user.
// Access token carries userId, email, role, and a jti (unique ID used for
// blacklisting on logout). Refresh token carries only userId — minimal data,
// since its only job is to prove the session is still valid.
function signTokens(user: { id: string; email: string; role: string }): AuthTokens {
  const { jwtSecret, jwtRefreshSecret } = getSecrets();
  const jti = randomUUID();

  const accessToken = jwt.sign(
    { userId: user.id, email: user.email, role: user.role, jti },
    jwtSecret,
    { expiresIn: '15m' },
  );

  const refreshToken = jwt.sign({ userId: user.id }, jwtRefreshSecret, { expiresIn: '7d' });

  return { accessToken, refreshToken };
}

// ── Register (public) ────────────────────────────────────────────────────────
// Always creates a MEMBER regardless of what role the caller sends in the body.
// The browser registration form calls this endpoint. Role field is intentionally
// not accepted here — use POST /auth/register/admin for creating admins.
export async function register(body: RegisterBody): Promise<SafeUser> {
  const existing = await findUserByEmail(body.email);
  if (existing) throw new AppError(409, 'Email already registered');

  const hashedPassword = await bcrypt.hash(body.password, SALT_ROUNDS);
  const user = await createUser({
    email: body.email,
    password: hashedPassword,
    name: body.name,
    role: 'MEMBER',
  });

  const { password: _password, ...safeUser } = user;
  return safeUser;
}

// ── Register Admin (Postman / seed only) ─────────────────────────────────────
// Creates an ADMIN user. Requires the caller to send the correct value in the
// x-admin-secret header — without it the request is rejected with 403.
// The secret is set via ADMIN_REGISTRATION_SECRET in the auth-service .env.
// This endpoint is intentionally not called from the browser register form.
export async function registerAdmin(body: RegisterBody, providedSecret: string | undefined): Promise<SafeUser> {
  const adminSecret = process.env.ADMIN_REGISTRATION_SECRET;
  if (!adminSecret || providedSecret !== adminSecret) {
    throw new AppError(403, 'Invalid or missing admin registration secret');
  }

  const existing = await findUserByEmail(body.email);
  if (existing) throw new AppError(409, 'Email already registered');

  const hashedPassword = await bcrypt.hash(body.password, SALT_ROUNDS);
  const user = await createUser({
    email: body.email,
    password: hashedPassword,
    name: body.name,
    role: 'ADMIN',
  });

  const { password: _password, ...safeUser } = user;
  return safeUser;
}

// ── Login ────────────────────────────────────────────────────────────────────
// bcrypt.compare(plain, hash): re-hashes the plain password with the salt
// stored inside the hash and compares. We always return the same 401 for both
// "email not found" and "wrong password" to avoid leaking which emails exist.
export async function login(body: LoginBody): Promise<AuthTokens> {
  const user = await findUserByEmail(body.email);
  if (!user) throw new AppError(401, 'Invalid credentials');

  const valid = await bcrypt.compare(body.password, user.password);
  if (!valid) throw new AppError(401, 'Invalid credentials');

  const tokens = signTokens(user);

  // Store refresh token in Redis so we can invalidate it on logout.
  // Key: refresh:{userId}, TTL: 7 days
  // Redis TTL handles expiry automatically
  await redis.set(`refresh:${user.id}`, tokens.refreshToken, 'EX', REFRESH_TOKEN_TTL);

  return tokens;
}

// ── Refresh ──────────────────────────────────────────────────────────────────
// Token rotation: every refresh call issues a NEW pair and deletes the old
// refresh token. If an attacker steals the refresh token and uses it after
// the legitimate user already rotated it, the stolen token is gone from Redis
// and the request fails. This limits the window of a stolen token.
export async function refresh(refreshToken: string): Promise<AuthTokens> {
  const { jwtRefreshSecret } = getSecrets();

  let decoded: { userId: string };
  try {
    decoded = jwt.verify(refreshToken, jwtRefreshSecret) as { userId: string };
  } catch {
    throw new AppError(401, 'Invalid refresh token');
  }

  const stored = await redis.get(`refresh:${decoded.userId}`);
  if (!stored || stored !== refreshToken) {
    throw new AppError(401, 'Refresh token revoked');
  }

  const user = await findUserById(decoded.userId);
  if (!user) throw new AppError(401, 'User not found');

  // Rotate: delete old, issue new
  await redis.del(`refresh:${decoded.userId}`);
  const tokens = signTokens(user);
  await redis.set(`refresh:${user.id}`, tokens.refreshToken, 'EX', REFRESH_TOKEN_TTL);

  return tokens;
}

// ── Logout ───────────────────────────────────────────────────────────────────
// Access tokens are stateless JWTs — they can't be "cancelled" by themselves.
// We solve this by storing the token's jti in a Redis blacklist until the token
// naturally expires. The gateway (Day 4) checks this blacklist on every request.
export async function logout(accessToken: string): Promise<void> {
  const { jwtSecret } = getSecrets();

  let decoded: jwt.JwtPayload & { userId: string; jti: string };
  try {
    decoded = jwt.verify(accessToken, jwtSecret) as jwt.JwtPayload & {
      userId: string;
      jti: string;
    };
  } catch {
    throw new AppError(401, 'Invalid access token');
  }

  const remaining = decoded.exp! - Math.floor(Date.now() / 1000);
  if (remaining > 0) {
    await redis.set(`blacklist:${decoded.jti}`, '1', 'EX', remaining);
  }

  await redis.del(`refresh:${decoded.userId}`);
}
