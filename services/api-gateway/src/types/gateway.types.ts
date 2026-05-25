export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  jti: string;
  exp: number;
  iat: number;
}

// Augment Express's Request so req.user is typed everywhere without casting.
// Set by jwtMiddleware on every authenticated request before proxying.
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        role: string;
      };
    }
  }
}
