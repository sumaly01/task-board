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
    Task["Task Service :4002\nProject/Task CRUD\nKafka Producer + Consumer"]
    Notif["Notification Service :4003\nKafka Consumer · Socket.io · Cron"]
    AI["AI Service :4004\nClaude Tool Use · Enrichment Pipeline"]

    AuthDB[("auth_db\nPostgreSQL :5401")]
    TaskDB[("task_db\nPostgreSQL :5433")]
    Redis[("Redis :6379\nCache · Tokens · Rate Limit · Pub/Sub")]
    Kafka["Kafka :9092\ntask.created · task.updated · task.deleted\ntask.enriched · task.ai_enriched"]
    Claude["Anthropic Claude API\nHaiku · Tool Use · Prompt Caching"]

    Browser -- "HTTP REST" --> GW
    GW -- "proxy /auth/*" --> Auth
    GW -- "proxy /tasks/* /projects/*" --> Task
    Browser -- "WebSocket :4003" --> Notif

    Auth --- AuthDB
    Auth -- "refresh tokens\nblacklist" --> Redis

    Task --- TaskDB
    Task -- "task.created\ntask.updated\ntask.deleted\ntask.ai_enriched" --> Kafka
    Task -- "cache-aside\ninvalidate" --> Redis

    GW -- "rate limit\ncounter" --> Redis

    Kafka -- "task.created\n(ai-enrichment-group)" --> AI
    AI -- "tool use\nprompt caching" --> Claude
    AI -- "task.enriched" --> Kafka
    Kafka -- "task.enriched\n(task-enrichment-consumer)" --> Task

    Kafka -- "task.created/updated/deleted\ntask.ai_enriched\n(notification-group)" --> Notif
    Notif -- "PUBLISH notifications\nchannel" --> Redis
    Redis -- "SUBSCRIBE notifications\nchannel" --> Notif
    Notif -- "emit notification" --> Browser
```

### Services

| Service              | Host Port | Responsibility                                                     |
|----------------------|-----------|--------------------------------------------------------------------|
| Frontend (Next.js)   | 3000      | Kanban board UI, drag-and-drop, real-time toast notifications      |
| API Gateway          | 4000      | JWT validation, RBAC role guard, rate limiting, proxy routing      |
| Auth Service         | 4001      | Register, login, JWT issuance, refresh token rotation, logout      |
| Task Service         | 4002      | Project/task CRUD, Redis cache, Kafka producer + AI enrichment consumer |
| Notification Service | 4003      | Kafka consumer, Redis pub/sub bridge, Socket.io push, cron reminders |
| AI Service           | 4004      | Kafka consumer, Claude tool use enrichment, `task.enriched` publisher |

### Infrastructure

| Component          | Host Port | Container Port | Purpose                                            |
|--------------------|-----------|----------------|----------------------------------------------------|
| PostgreSQL (auth)  | 5401      | 5432           | `auth_db` — users and roles                        |
| PostgreSQL (tasks) | 5433      | 5432           | `task_db` — projects, tasks, AI enrichment fields  |
| Redis              | 6379      | 6379           | Token storage, task cache, rate limits, pub/sub    |
| Kafka              | 29092     | 9092           | Event bus — inter-container traffic uses port 9092 |
| Zookeeper          | 2181      | 2181           | Kafka cluster coordination                         |

---

## Complete Request & Event Flow

### Task creation — HTTP path (always runs)

```
Browser
  │  POST /tasks  (Authorization: Bearer <JWT>)
  ▼
API Gateway :4000
  ├── JWT middleware       validates token, attaches req.user { userId, role, email }
  ├── Rate limit           Redis sliding window: ZADD/ZREMRANGEBYSCORE/ZCARD  ratelimit:user:{userId}  (100 req/60s, returns 429 on breach)
  ├── Role guard           requireRole('ADMIN') → 403 if MEMBER
  └── http-proxy           forwards to task-service:4002
         │
         ▼
Task Service :4002
  ├── Controller           reads req.body + req.user
  ├── Service              validates input (title required, projectId required, assigneeId required)
  ├── Prisma               INSERT task into task_db (PostgreSQL :5433)
  ├── Redis                DEL tasks:project:{projectId}:admin
  │                        DEL tasks:project:{projectId}:member:*  (all member keys for this project)
  └── Kafka producer       PUBLISH task.created → Kafka :9092
         │
         ▼
HTTP 201 response returns immediately to browser
(everything below is async — does not block this response)
```

### Kafka fan-out after `task.created`

```
Kafka  topic: task.created
  │
  ├── notification-service  groupId: notification-group
  │     ├── if assigneeId === createdBy → skip (no self-notification)
  │     ├── redisPublisher.publish('notifications', payload)
  │     └── redisSubscriber.on('message')
  │           └── io.to(socketId).emit('notification', payload)
  │                      │
  │                      ▼
  │               Member's browser
  │               toast: "A new task has been assigned to you"
  │
  └── ai-service  groupId: ai-enrichment-group
        ├── if AI_ENRICHMENT_ENABLED !== 'true' → log "enrichment disabled", return
        ├── Anthropic Claude API  model: claude-haiku-4-5
        │     ├── tool use: enrich_task (forced via tool_choice)
        │     ├── system prompt with cache_control: ephemeral  (prompt caching)
        │     └── returns: { aiDescription, aiPriority, aiEffort, aiTags }
        └── Kafka producer  PUBLISH task.enriched → Kafka :9092
```

### Kafka chain after `task.enriched` (AI only)

```
Kafka  topic: task.enriched
  │
  └── task-service  groupId: task-enrichment-consumer
        ├── Prisma   UPDATE task SET aiDescription, aiPriority, aiEffort, aiTags, aiEnriched=true
        ├── Redis    DEL tasks:project:{projectId}:admin  +  DEL tasks:project:{projectId}:member:*
        └── Kafka    PUBLISH task.ai_enriched → Kafka :9092
               │
               ▼
        Kafka  topic: task.ai_enriched
               │
               └── notification-service  groupId: notification-group
                     ├── targets createdBy (admin), not assigneeId
                     ├── redisPublisher.publish('notifications', payload)
                     └── redisSubscriber.on('message')
                           └── io.to(socketId).emit('notification', payload)
                                      │
                                      ▼
                               Admin's browser
                               ✨ badge appears on task card
```

### Redis pub/sub bridge inside notification-service

```
Kafka consumer  (single instance handles all Kafka messages)
  └── redisPublisher.publish('notifications', JSON payload)
                                │
                     Redis channel: 'notifications'
                                │
               ┌────────────────┴────────────────┐
               ▼                                 ▼
   redisSubscriber (instance A)     redisSubscriber (instance B — if scaled)
   checks userSocketMap             checks userSocketMap
   → delivers if socket found here  → no-op if socket not here
```

### GET /tasks — cache-aside flow

```
Browser  GET /tasks?projectId=X
  ▼
API Gateway → Task Service :4002
  │
  ├── Redis GET tasks:project:{projectId}:admin          (role === ADMIN)
  │   or    GET tasks:project:{projectId}:member:{userId} (role === MEMBER)
  │
  ├── Cache HIT  → return immediately (no DB query)
  │
  └── Cache MISS
        ├── ADMIN:  SELECT * FROM Task WHERE projectId = X
        └── MEMBER: SELECT * FROM Task WHERE projectId = X AND assigneeId = userId
        └── Redis SET key  (60s TTL)
        └── return tasks
```

### node-cron — due date reminders (every 5 minutes, independent of Kafka)

```
node-cron  */5 * * * *
  └── notification-service
        ├── Prisma  SELECT tasks WHERE dueDate within 24h AND reminderSent = false
        ├── Prisma  UPDATE task SET reminderSent = true
        └── Socket.io  io.to(socketId).emit('notification', TASK_REMINDER payload)
```

### Kafka topics & consumer groups

| Topic              | Producer         | Consumer             | Consumer Group             |
|--------------------|------------------|----------------------|----------------------------|
| `task.created`     | Task Service     | Notification Service | `notification-group`       |
| `task.created`     | Task Service     | AI Service           | `ai-enrichment-group`      |
| `task.updated`     | Task Service     | Notification Service | `notification-group`       |
| `task.deleted`     | Task Service     | Notification Service | `notification-group`       |
| `task.enriched`    | AI Service       | Task Service         | `task-enrichment-consumer` |
| `task.ai_enriched` | Task Service     | Notification Service | `notification-group`       |

All six topics are pre-created by notification-service at startup via the Kafka Admin API — this prevents `UNKNOWN_TOPIC_OR_PARTITION` errors when `task.ai_enriched` does not yet exist (e.g. AI disabled or fresh Kafka state).

### Redis key patterns

| Key                                           | Service              | Purpose                               | TTL                      |
|-----------------------------------------------|----------------------|---------------------------------------|--------------------------|
| `refresh:{userId}`                            | Auth Service         | Refresh token store                   | 7 days                   |
| `blacklist:{jti}`                             | Auth Service         | Revoked access token (logout)         | Remaining token lifetime |
| `ratelimit:user:{userId}`                     | API Gateway          | Sliding window sorted set (authenticated routes) | 60 seconds      |
| `ratelimit:ip:{ip}`                           | API Gateway          | Sliding window sorted set (/auth/* routes) | 60 seconds           |
| `tasks:project:{projectId}:admin`             | Task Service         | Cached full task list (ADMIN view)    | 60 seconds               |
| `tasks:project:{projectId}:member:{userId}`   | Task Service         | Cached member-scoped task list        | 60 seconds               |
| `notifications` *(pub/sub channel)*           | Notification Service | Bridge between Kafka consumer and Socket.io | No TTL             |

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

## AI Task Enrichment

When an admin creates a task, the ai-service asynchronously enriches it using the Anthropic Claude API. The full pipeline runs in the background — the task creation HTTP response returns immediately.

**What Claude generates (via tool use):**
- `aiDescription` — a 1-3 sentence brief of what the task involves and what "done" looks like
- `aiPriority` — suggested priority: `LOW`, `MEDIUM`, or `HIGH`
- `aiEffort` — T-shirt size estimate: `XS`, `S`, `M`, `L`, or `XL`
- `aiTags` — up to 4 lowercase labels (e.g. `"security"`, `"backend"`, `"bug"`)

**How it arrives in the browser (2-5 seconds after task creation):**

```
task.created (Kafka)
  → ai-service calls Claude API (tool use)
  → task.enriched (Kafka)
  → task-service writes AI fields to DB, invalidates cache
  → task.ai_enriched (Kafka)
  → notification-service → Redis pub/sub → Socket.io
  → ✨ badge appears on the task card (admin browser only)
```

The admin clicks the task card to see the suggestions panel, then chooses **Accept all** (applies description + priority to the real task fields) or **Dismiss** (clears the badge without changing the task). AI never overwrites fields without consent.

**Key engineering decisions:**
- **Tool use over plain completion** — forces typed, schema-validated output. No JSON parsing, no markdown wrapping edge cases.
- **`claude-haiku-4-5` model** — fast and cheap for structured extraction. Sonnet/Opus would add latency and cost for no quality benefit on this workload.
- **Prompt caching on the system prompt** — same instructions on every call. Cached tokens are billed at ~10% of normal input price; cache stays warm under continuous task creation traffic.
- **Separate `ai-service`** — API key isolation, independent failure blast radius, independent scaling.

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
- **Health checks**: `GET http://localhost:400{0,1,2,3,4}/health`

> **AI Service prerequisite:** The `ai-service` requires an Anthropic API key. Add it to a `.env` file at the project root (same folder as `docker-compose.yml`) before running:
> ```
> ANTHROPIC_API_KEY=sk-ant-...
> ```
> Without this, task creation still works — AI enrichment is a best-effort background feature and its failure is isolated from the core service.

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

### `services/ai-service/.env`

| Variable            | Example                    | Description                              |
|---------------------|----------------------------|------------------------------------------|
| `PORT`              | `4004`                     |                                          |
| `KAFKA_BROKERS`     | `kafka:9092`               | Kafka broker address (Docker)            |
| `ANTHROPIC_API_KEY` | `sk-ant-...`               | Anthropic API key for Claude tool use    |

### `.env` (project root — required for Docker Compose)

| Variable                | Example    | Description                                                         |
|-------------------------|------------|---------------------------------------------------------------------|
| `ANTHROPIC_API_KEY`     | `sk-ant-…` | Injected into the ai-service container by `docker-compose.yml`      |
| `AI_ENRICHMENT_ENABLED` | `true`     | Set to `false` to disable all Claude API calls (no cost incurred)   |

> **Why a root `.env`?** Docker Compose substitutes `${VAR}` in `docker-compose.yml` from the root `.env` — not from service-level `.env` files. To toggle AI off: set `AI_ENRICHMENT_ENABLED=false` here, then run `docker-compose up -d --force-recreate ai-service`. No rebuild required.

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

# AI service (5 tests — mocks Anthropic SDK, no real API calls)
cd services/ai-service && npm test
```

### What the tests cover

| Suite                | Key scenarios                                                    |
|----------------------|------------------------------------------------------------------|
| auth-service         | Register (email/password validation, duplicate), login, refresh token rotation, logout + blacklist |
| task-service         | CRUD happy paths, ADMIN sees all tasks, MEMBER sees only assigned tasks, Redis cache HIT/MISS |
| api-gateway          | JWT missing/invalid/blacklisted, MEMBER blocked on ADMIN-only routes (403), rate limit (429) |
| notification-service | Kafka → Redis publish, self-notification suppressed, Socket.io delivers to correct user only |
| ai-service           | Structured enrichment result shape, priority/effort enum validation, max 4 tags, no-tool-use error handling |

---

## Verifying Redis and Kafka (Docker)

### Redis — confirm task cache is working

```bash
docker exec -it taskflow-redis redis-cli

# After calling GET /tasks?projectId=<id> as ADMIN:
KEYS tasks:project:*                            # shows all cached keys for this project
TTL tasks:project:<id>:admin                    # remaining TTL (max 60s)
GET tasks:project:<id>:admin                    # cached JSON array (ADMIN view — all tasks)

# After calling GET /tasks?projectId=<id> as MEMBER:
GET tasks:project:<id>:member:<userId>          # cached JSON array (MEMBER view — own tasks only)

# Refresh token stored after login:
KEYS refresh:*

# Blacklisted token after logout:
KEYS blacklist:*
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

### Kafka — confirm AI enrichment pipeline

```bash
# Watch for AI enrichment results (appears 2-5s after task creation):
docker exec -it taskflow-kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic task.enriched \
  --from-beginning

# Watch for the downstream notification event:
docker exec -it taskflow-kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic task.ai_enriched \
  --from-beginning
```

If enrichment is not appearing, check ai-service logs:
```bash
docker-compose logs -f ai-service
# Look for: [ai] enriching task ... and [kafka] task.enriched published
# Common failure: ANTHROPIC_API_KEY missing from root .env
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
├── .env                         ← ANTHROPIC_API_KEY for Docker Compose (gitignored)
├── CLAUDE.md                    ← AI session context and sprint plan
├── CHANGES.md                   ← full change log
├── postman/                     ← importable Postman collections + environment
├── services/
│   ├── api-gateway/             ← JWT + RBAC + rate limit + proxy
│   ├── auth-service/            ← register, login, refresh, logout
│   ├── task-service/            ← project/task CRUD, Redis cache, Kafka producer + consumer
│   ├── notification-service/    ← Kafka consumer, Socket.io, cron reminders
│   └── ai-service/              ← Kafka consumer, Claude tool use enrichment, task.enriched publisher
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
| AI            | Anthropic Claude API — Haiku model, tool use, prompt caching  |
| Testing       | Jest, Supertest, ts-jest                                      |
| Containers    | Docker, Docker Compose                                        |
