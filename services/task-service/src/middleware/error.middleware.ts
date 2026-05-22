import { Request, Response, NextFunction } from 'express';

// AppError is thrown by service functions to signal a known failure (wrong input,
// not found, etc.) with an HTTP status code. The errorHandler below catches it
// and returns a structured JSON response instead of crashing the process.
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
}
