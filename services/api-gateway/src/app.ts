import express, { Request as ExpressRequest } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { jwtMiddleware } from './middleware/auth.middleware';
import { ipRateLimiter, userRateLimiter } from './middleware/ratelimit.middleware';

const app = express();

app.use(helmet());
app.use(cors());
// No express.json() — the gateway never reads request bodies.
// Parsing the body here would consume the stream; http-proxy-middleware would
// then have nothing left to forward to the upstream service.

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'api-gateway' });
});

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://localhost:4001';
const TASK_SERVICE_URL = process.env.TASK_SERVICE_URL ?? 'http://localhost:4002';

// ── Rate limiting ─────────────────────────────────────────────────────────────

// /auth/* — IP-based limiting (user has no token yet on register/login).
app.use('/auth', ipRateLimiter);

// /projects/* and /tasks/* — JWT validation first (populates req.user),
// then user-based limiting. Order matters: jwtMiddleware must run before
// userRateLimiter so the rate limiter key can use req.user.userId.
app.use(['/projects', '/tasks'], jwtMiddleware, userRateLimiter);

// ── Proxy routing ─────────────────────────────────────────────────────────────
//
// Proxies are mounted at root (app.use) with pathFilter instead of
// app.use('/path', proxy). This preserves the full URL — the upstream service
// receives /auth/login, /tasks/:id, etc. — no pathRewrite needed.
//
// Express restores req.url to the original value after a path-mounted
// middleware chain calls next(), so pathFilter sees /auth/login not /login.

app.use(
  createProxyMiddleware({
    target: AUTH_SERVICE_URL,
    changeOrigin: true,
    pathFilter: ['/auth'],
  }),
);

// Task/project proxy injects user identity headers so task-service never
// needs to re-verify the JWT — it trusts the x-user-* headers from the gateway.
app.use(
  createProxyMiddleware({
    target: TASK_SERVICE_URL,
    changeOrigin: true,
    pathFilter: ['/projects', '/tasks'],
    on: {
      proxyReq: (proxyReq, req) => {
        const user = (req as unknown as ExpressRequest).user;
        if (user) {
          proxyReq.setHeader('x-user-id', user.userId);
          proxyReq.setHeader('x-user-email', user.email);
          proxyReq.setHeader('x-user-role', user.role);
        }
      },
    },
  }),
);

export default app;
