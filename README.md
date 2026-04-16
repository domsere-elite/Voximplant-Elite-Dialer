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
