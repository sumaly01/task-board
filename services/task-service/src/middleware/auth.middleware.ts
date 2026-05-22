import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// requireAuth extracts the caller's identity and attaches it to req.user.
//
// Two modes, checked in order:
//   1. x-user-id header — set by the API Gateway (Day 4) after verifying the JWT.
//      Inner services trust these headers; they never re-verify the JWT themselves.
//   2. Authorization: Bearer <token> — for direct Postman testing before the gateway
//      exists (Day 3). The middleware verifies the signature itself using JWT_SECRET.
//
// On Day 4, mode 1 becomes the only path used in production.
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Gateway path — headers already set
  const headerUserId = req.headers['x-user-id'] as string | undefined;
  if (headerUserId) {
    req.user = {
      userId: headerUserId,
      email: (req.headers['x-user-email'] as string) ?? '',
      role: (req.headers['x-user-role'] as string) ?? 'MEMBER',
    };
    next();
    return;
  }

  // Direct path — parse Bearer token (Day 3 Postman testing)
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
    const decoded = jwt.verify(token, secret) as {
      userId: string;
      email: string;
      role: string;
    };
    req.user = { userId: decoded.userId, email: decoded.email, role: decoded.role };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
