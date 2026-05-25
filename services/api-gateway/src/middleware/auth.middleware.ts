import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import redis from '../lib/redis';
import { JwtPayload } from '../types/gateway.types';

// jwtMiddleware runs on every protected route (/projects/*, /tasks/*).
//
// Two checks in sequence:
//   1. Verify JWT signature and expiry — rejects tampered or expired tokens.
//   2. Check Redis blacklist key `blacklist:{jti}` — rejects tokens that were
//      valid when issued but have since been revoked via POST /auth/logout.
//      Without this check, a stolen token would remain usable until its 15-minute
//      expiry even after the legitimate user logged out.
//
// On success, sets req.user so downstream middleware and the proxy's onProxyReq
// handler can inject x-user-* headers without re-verifying the token.
export async function jwtMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'JWT_SECRET not configured' });
    return;
  }

  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;

    const blacklisted = await redis.exists(`blacklist:${decoded.jti}`);
    if (blacklisted) {
      res.status(401).json({ error: 'Token has been revoked' });
      return;
    }

    req.user = { userId: decoded.userId, email: decoded.email, role: decoded.role };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
