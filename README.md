# Elite Dialer

Standalone production voice communication platform replacing TCN and Retell AI. Integrates with Elite Portfolio CRM via REST API.

## Architecture

- **Backend** — Fastify + TypeScript + Prisma + BullMQ
- **Frontend** — Next.js 14 (App Router) + Tailwind
- **Voximplant** — SmartQueue PDS, Call Lists API, WebSDK, VoxEngine
- **Database** — PostgreSQL (thin dialer-only schema)
- **Queue** — BullMQ on Redis

## Quick Start

### Prerequisites

- Node.js 20+
- npm 10+
- PostgreSQL 15+
- Redis 7+

### Setup

``` bash
# Install dependencies
npm install

# Copy env template
cp .env.example .env
# Edit .env with your values

# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Start backend
npm run dev:backend

# In another terminal, start frontend
npm run dev:frontend
```

### Workspace Commands

``` bash
npm run dev:backend      # Start backend dev server
npm run dev:frontend     # Start frontend dev server
npm run build:backend    # Build backend
npm run build:frontend   # Build frontend
npm run test:backend     # Run backend tests
npm run test:frontend    # Run frontend tests
npm run db:generate      # Regenerate Prisma client
npm run db:migrate       # Run Prisma migrations
```

## Project Structure

```
elite-dialer/
├── backend/          # Fastify API + Socket.IO + BullMQ workers
├── frontend/         # Next.js UI
├── voxfiles/         # VoxEngine scenarios + shared modules
├── docker-compose.yml
└── .env.example
```

## Documentation

- Design spec: `docs/superpowers/specs/2026-04-16-elite-dialer-design.md`
- Implementation plans: `docs/superpowers/plans/`

## Elite Dialer v1

### Prerequisites

- Docker Engine 24+ and Docker Compose v2
- Node.js 20+ (for local development outside Docker)
- Running instance of Elite Portfolio CRM with `X-Dialer-Key` auth middleware enabled
- Voximplant account with:
  - Application created for the dialer
  - SmartQueue configured (`outbound_queue`, `inbound_queue`)
  - API credentials (account ID + API key)
  - At least one DID assigned

### Setup

1. Copy environment template and fill values:
   ```
   cp .env.example .env
   ```
   Required variables: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `VOX_ACCOUNT_ID`, `VOX_API_KEY`, `VOX_APP_NAME`, `CRM_BASE_URL`, `CRM_API_KEY`, `DIALER_API_KEY`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`.

2. Start services:
   ```
   docker compose up -d
   ```

3. The first backend boot auto-runs `prisma migrate deploy`. For development use `npx prisma migrate dev` in `backend/`.

4. Seed agent mappings and DID groups via the admin UI at `http://localhost:3000/dashboard`.

### Running

- **Dev:** `cd backend && npm run dev` + `cd frontend && npm run dev` with a local Postgres/Redis.
- **Prod:** `docker compose up -d --build` on the target host; put an HTTPS reverse proxy (Caddy/Nginx) in front of ports 3000 and 5000.

### Smoke Test

```
./scripts/smoke-test.sh
```

Add `--cleanup` to tear down the stack after testing. Override endpoints via `BACKEND_URL` / `FRONTEND_URL`. Use `SMOKE_JWT` to bypass login if the CRM is unreachable.

### Deploying the Inbound IVR

```
voximplant scenario upload voxfiles/scenarios/inbound-ivr.voxengine.js
```

Then bind it to the inbound rule in the Voximplant console.
