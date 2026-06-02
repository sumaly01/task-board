# TaskFlow

A real-time task and team management platform — a lightweight Jira/Asana clone built as a portfolio project to demonstrate event-driven microservices architecture.

---

## What It Does

TaskFlow lets teams create projects, assign tasks, and track progress on a Kanban board. Admins manage everything; members see and work on only the tasks assigned to them. When an admin assigns a task, the member receives an instant WebSocket notification in their browser.

---

## Architecture

```mermaid
graph TD
    Browser["🖥️ Browser\nNext.js :3000"]

    GW["API Gateway :4000\nJWT · RBAC · Rate Limit · Proxy"]

    Auth["Auth Service :4001\nRegister · Login · Refresh · Logout"]
    Task["Task Service :4002\nProject/Task CRUD"]
    Notif["Notification Service :4003\nKafka Consumer · Socket.io · Cron"]

    AuthDB[("auth_db :5432\nPostgreSQL")]
    TaskDB[("task_db :5433\nPostgreSQL")]
    Redis[("Redis :6379\nCache · Tokens · Rate Limit · Pub/Sub")]
    Kafka["Kafka :9092\ntask.created\ntask.updated\ntask.deleted"]

    Browser -- "HTTP REST" --> GW
    GW -- "proxy /auth/*" --> Auth
    GW -- "proxy /tasks/* /projects/*" --> Task
    Browser -- "WebSocket" --> Notif

    Auth --- AuthDB
    Auth --- Redis

    Task --- TaskDB
    Task -- "publish events" --> Kafka
    Task --- Redis

    GW --- Redis

    Kafka -- "consume events" --> Notif
    Notif -- "pub/sub fan-out" --> Redis
```

### Services

| Service              | Port | Responsibility                                              |
|----------------------|------|-------------------------------------------------------------|
| Frontend (Next.js)   | 3000 | Kanban board UI, drag-and-drop, real-time toasts            |
| API Gateway          | 4000 | JWT auth, RBAC, rate limiting, proxy routing                |
| Auth Service         | 4001 | Register, login, JWT issuance, refresh token rotation       |
| Task Service         | 4002 | Project/task CRUD, Redis caching, Kafka event publishing    |
| Notification Service | 4003 | Kafka consumer, Socket.io WebSocket push, cron reminders    |

### Infrastructure

| Component  | Port  | Purpose                                            |
|------------|-------|----------------------------------------------------|
| PostgreSQL  | 5432  | auth_db — users and roles                          |
| PostgreSQL  | 5433  | task_db — projects and tasks                       |
| Redis      | 6379  | Token storage, task cache, rate limits, pub/sub    |
| Kafka      | 9092  | Durable event bus between task and notification    |
| Zookeeper  | 2181  | Kafka cluster coordination                         |

---

## RBAC Model

Every backend route and frontend UI element enforces role-based access control.

### Roles

- **ADMIN** — project manager / team lead. Created via a special endpoint with a secret header.
- **MEMBER** — regular team member. Created via the standard `/auth/register` endpoint.

### What each role can do

| Action                              | ADMIN | MEMBER             |
|-------------------------------------|-------|--------------------|
| Create project                      | ✅    | ❌ (403)           |
| View all projects                   | ✅    | ❌                 |
| View own assigned projects          | —     | ✅                 |
| Create task / assign to member      | ✅    | ❌ (403)           |
| View all tasks in a project         | ✅    | ❌                 |
| View own assigned tasks only        | —     | ✅                 |
| Update task status (drag-and-drop)  | ✅    | ✅ (own tasks)     |
| Delete task                         | ✅    | ❌ (403)           |
| View member list                    | ✅    | ❌ (403)           |
| Receive WebSocket task notification | —     | ✅ (when assigned) |

Enforcement layers:
1. **API Gateway** — role guard middleware returns 403 before the request reaches Task Service
2. **Task Service** — query scoping ensures members never receive data they shouldn't see even if the gateway is bypassed
3. **Frontend** — UI conditionally hides controls the current user can't use

---

## Prerequisites

- [Node.js](https://nodejs.org) v20+
- [Docker Desktop](https://www.docker.com/products/docker-desktop) (includes Docker Compose)
- [Postman](https://www.postman.com) (optional, for API testing)

---

## How to Run

```bash
# Clone the repo
git clone <repo-url>
cd task-board

# Start all 10 containers (first run downloads images — takes a few minutes)
docker-compose up --build

# Wipe all data and restart from scratch
docker-compose down -v && docker-compose up --build
```

Once running:
- **Frontend**: http://localhost:3000
- **API Gateway**: http://localhost:4000
- **Health checks**: `GET http://localhost:400{0,1,2,3}/health`

---

## Creating an Admin User

The standard registration form (`/register`) always creates a MEMBER. To create an ADMIN:

```bash
# Set ADMIN_REGISTRATION_SECRET in services/auth-service/.env, then:
curl -X POST http://localhost:4000/auth/register/admin \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: your_secret_here" \
  -d '{"email":"admin@example.com","password":"password123","name":"Admin User"}'
```

Or use the Postman collection — see **Postman Setup** below.

---

## Environment Variables

Each service reads its configuration from a `.env` file in its own directory. These files are gitignored. Copy the `.env.example` in each service folder as a starting point.

### `services/api-gateway/.env`

| Variable             | Example                          | Description                          |
|----------------------|----------------------------------|--------------------------------------|
| `PORT`               | `4000`                           | Gateway listen port                  |
| `JWT_SECRET`         | `changeme`                       | Must match auth-service JWT_SECRET   |
| `AUTH_SERVICE_URL`   | `http://auth-service:4001`       | Auth service address (Docker)        |
| `TASK_SERVICE_URL`   | `http://task-service:4002`       | Task service address (Docker)        |
| `REDIS_URL`          | `redis://redis:6379`             | Redis address (Docker)               |

### `services/auth-service/.env`

| Variable                    | Example                                      | Description               |
|-----------------------------|----------------------------------------------|---------------------------|
| `PORT`                      | `4001`                                       |                           |
| `DATABASE_URL`              | `postgresql://postgres:postgres@auth-db:5432/auth_db` |            |
| `JWT_SECRET`                | `changeme`                                   | Access token signing key  |
| `JWT_REFRESH_SECRET`        | `changeme_refresh`                           | Refresh token signing key |
| `REDIS_URL`                 | `redis://redis:6379`                         |                           |
| `ADMIN_REGISTRATION_SECRET` | `supersecret`                                | Required to create admins |

### `services/task-service/.env`

| Variable           | Example                                            | Description           |
|--------------------|----------------------------------------------------|-----------------------|
| `PORT`             | `4002`                                             |                       |
| `DATABASE_URL`     | `postgresql://postgres:postgres@task-db:5432/task_db` |                    |
| `JWT_SECRET`       | `changeme`                                         | Must match gateway    |
| `REDIS_URL`        | `redis://redis:6379`                               |                       |
| `KAFKA_BROKERS`    | `kafka:9092`                                       | Kafka broker address  |
| `AUTH_SERVICE_URL` | `http://auth-service:4001`                         | For GET /members      |

### `services/notification-service/.env`

| Variable            | Example                                            | Description           |
|---------------------|----------------------------------------------------|-----------------------|
| `PORT`              | `4003`                                             |                       |
| `REDIS_URL`         | `redis://redis:6379`                               |                       |
| `KAFKA_BROKERS`     | `kafka:9092`                                       |                       |
| `TASK_DATABASE_URL` | `postgresql://postgres:postgres@task-db:5432/task_db` | Cron job reads this |

### `frontend/.env`

| Variable               | Example                    | Description                    |
|------------------------|----------------------------|--------------------------------|
| `NEXT_PUBLIC_API_URL`  | `http://localhost:4000`    | API gateway URL (browser)      |
| `NEXT_PUBLIC_WS_URL`   | `http://localhost:4003`    | Socket.io URL (browser)        |

> **Note:** When running inside Docker, services talk to each other using container names (e.g. `kafka:9092`, `redis:6379`). The `docker-compose.yml` already sets these correctly via its `environment:` blocks — the `.env` files are only needed for running services locally outside Docker.

---

## How to Run Tests

Each service has its own Jest + Supertest test suite. Tests mock all external dependencies (DB, Redis, Kafka, Socket.io) so no Docker stack is required.

```bash
# Auth service (15 tests)
cd services/auth-service && npm test

# Task service (21 tests — includes RBAC role-scoping tests)
cd services/task-service && npm test

# API Gateway (18 tests — includes JWT, role guard, rate limiting)
cd services/api-gateway && npm test

# Notification service (6 tests — includes end-to-end Socket.io delivery test)
cd services/notification-service && npm test
```

### What the tests cover

| Suite                | Key scenarios                                                    |
|----------------------|------------------------------------------------------------------|
| auth-service         | Register (email/password validation, duplicate), login, refresh token rotation, logout + blacklist |
| task-service         | CRUD happy paths, ADMIN sees all tasks, MEMBER sees only assigned tasks, Redis cache HIT/MISS |
| api-gateway          | JWT missing/invalid/blacklisted, MEMBER blocked on ADMIN-only routes (403), rate limit (429) |
| notification-service | Kafka → Redis publish, self-notification suppressed, Socket.io delivers to correct user only |

---

## Verifying Redis and Kafka (Docker)

### Redis — confirm task cache is working

```bash
docker exec -it taskflow-redis redis-cli

# After calling GET /tasks?projectId=<id> once, run:
KEYS tasks:project:*          # shows the cached key
TTL tasks:project:<id>:admin  # shows remaining TTL (max 60s)
GET tasks:project:<id>:admin  # shows the cached JSON array

# Refresh token stored after login:
KEYS refresh:*
```

### Kafka — confirm task events are firing

```bash
# In a terminal, start consuming task.created events:
docker exec -it taskflow-kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic task.created \
  --from-beginning

# In Postman, create a task via POST /tasks
# The JSON event payload will appear in the terminal within 1 second.
```

If Kafka events are not appearing, check the task-service logs:
```bash
docker-compose logs -f task-service
```

---

## Postman Setup

1. Download and open [Postman](https://www.postman.com)
2. Create a workspace called **TaskFlow**
3. Import all collections: `File → Import` → select all files in `/postman/*.json`
4. Import the environment: `File → Import` → select `/postman/taskflow-env.json`
5. Set the active environment to **TaskFlow Local**

**Login first** — the login request auto-saves `{{access_token}}` and `{{refresh_token}}` to the environment. Every subsequent request uses `{{access_token}}` in the `Authorization: Bearer` header.

**RBAC testing** — create two Postman environments:
- **TaskFlow Admin** — log in as an admin user
- **TaskFlow Member** — log in as a member user

Then switch environments to verify that MEMBER requests to `POST /tasks`, `POST /projects`, and `DELETE /tasks/:id` return `403 Forbidden`.

The `x-admin-secret` header (value from `ADMIN_REGISTRATION_SECRET`) is required only for `POST /auth/register/admin`.

---

## Project Structure

```
task-board/
├── docker-compose.yml
├── CLAUDE.md                    ← AI session context and sprint plan
├── CHANGES.md                   ← full change log
├── postman/                     ← importable Postman collections + environment
├── services/
│   ├── api-gateway/             ← JWT + RBAC + rate limit + proxy
│   ├── auth-service/            ← register, login, refresh, logout
│   ├── task-service/            ← project/task CRUD, Redis cache, Kafka producer
│   └── notification-service/    ← Kafka consumer, Socket.io, cron reminders
└── frontend/                    ← Next.js 14 App Router, Tailwind, Kanban board
```

---

## Tech Stack

| Layer         | Technology                                                    |
|---------------|---------------------------------------------------------------|
| Language      | TypeScript (strict mode everywhere)                           |
| Frontend      | Next.js 14 (App Router), Tailwind CSS, @hello-pangea/dnd      |
| Backend       | Node.js, Express.js                                           |
| ORM           | Prisma (schema-first, type-safe, migrations)                  |
| Database      | PostgreSQL (separate DB per service)                          |
| Cache/PubSub  | Redis (ioredis)                                               |
| Message Broker| Kafka (kafkajs)                                               |
| Auth          | JWT (jsonwebtoken), bcrypt, httpOnly cookies                  |
| Real-time     | Socket.io                                                     |
| Scheduling    | node-cron (due-date reminders every 5 minutes)                |
| Testing       | Jest, Supertest, ts-jest                                      |
| Containers    | Docker, Docker Compose                                        |
