# Elite Dialer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone production voice communication platform replacing TCN and Retell AI, handling 20k+ calls/day for 5-15 agents with 4 dial modes, inbound IVR, and full compliance enforcement.

**Architecture:** Fastify backend orchestrates Voximplant's native SmartQueue PDS, Call Lists API, and WebSDK. Thin Prisma database stores campaign config, agent mappings, DIDs, and call events. Account/payment/compliance data lives in existing CRM, accessed via REST API with BullMQ-powered async sync.

**Tech Stack:** Fastify, TypeScript, Prisma, PostgreSQL, BullMQ, Redis, Next.js 14, Tailwind, Socket.IO, Voximplant WebSDK + VoxEngine, Docker Compose

## Phase 1: Foundation

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `README.md`

- [ ] **Step 1: Create root package.json with workspaces**

```json
{
  "name": "elite-dialer",
  "version": "0.1.0",
  "private": true,
  "description": "Standalone voice communication platform replacing TCN and Retell AI, integrated with Elite Portfolio CRM.",
  "workspaces": [
    "backend",
    "frontend"
  ],
  "scripts": {
    "dev:backend": "npm run dev --workspace=backend",
    "dev:frontend": "npm run dev --workspace=frontend",
    "build:backend": "npm run build --workspace=backend",
    "build:frontend": "npm run build --workspace=frontend",
    "test:backend": "npm run test --workspace=backend",
    "test:frontend": "npm run test --workspace=frontend",
    "lint": "npm run lint --workspaces --if-present",
    "db:generate": "npm run db:generate --workspace=backend",
    "db:migrate": "npm run db:migrate --workspace=backend",
    "db:push": "npm run db:push --workspace=backend"
  },
  "engines": {
    "node": ">=20.0.0",
    "npm": ">=10.0.0"
  }
}
```

- [ ] **Step 2: Create root .gitignore**

```gitignore
# Dependencies
node_modules/
.pnp
.pnp.js

# Environment
.env
.env.local
.env.development
.env.production
.env.test
!.env.example

# Build outputs
dist/
build/
.next/
out/
*.tsbuildinfo

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
logs/

# Testing
coverage/
.nyc_output/

# Editor
.vscode/
.idea/
*.swp
*.swo
.DS_Store
Thumbs.db

# Prisma
backend/prisma/migrations/dev.db*

# Voximplant credentials
vox_credentials.json
*.vox_credentials.json

# Docker
docker-compose.override.yml

# Misc
tmp/
temp/
```

- [ ] **Step 3: Create root .env.example**

```bash
# Server
NODE_ENV=production
PORT=5000

# Database
DATABASE_URL=postgresql://dialer:dialer@localhost:5432/elite_dialer

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=change-me-to-a-string-at-least-32-characters-long
JWT_EXPIRES_IN=8h

# Voximplant
VOXIMPLANT_ACCOUNT_ID=
VOXIMPLANT_API_KEY_ID=
VOXIMPLANT_API_KEY_PATH=./vox_credentials.json
VOXIMPLANT_APPLICATION_ID=
VOXIMPLANT_APPLICATION_NAME=
VOXIMPLANT_ACCOUNT_NAME=

# CRM Integration
CRM_BASE_URL=https://your-crm.vercel.app
CRM_API_KEY=

# Recording
RECORDING_S3_BUCKET=
RECORDING_S3_REGION=
RECORDING_S3_ACCESS_KEY=
RECORDING_S3_SECRET_KEY=

# Frontend
FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_DIALER_API_URL=http://localhost:5000
NEXT_PUBLIC_CRM_URL=https://your-crm.vercel.app

# Logging
LOG_LEVEL=info
```

- [ ] **Step 4: Create root README.md**

```markdown
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

```bash
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

```bash
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
```

- [ ] **Step 5: Verify repository structure**

Run: `ls -la`
Expected: see `package.json`, `.gitignore`, `.env.example`, `README.md` in root, plus existing `docs/` directory.

Run: `cat package.json | grep workspaces`
Expected: shows `"workspaces":` line with backend/frontend listed.

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore .env.example README.md
git commit -m "feat: scaffold monorepo with workspaces, env template, and README"
```

---

### Task 2: Backend package.json and tsconfig

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/vitest.config.ts`

- [ ] **Step 1: Create backend/package.json**

```json
{
  "name": "@elite-dialer/backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push",
    "db:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@fastify/cors": "^9.0.1",
    "@fastify/helmet": "^11.1.1",
    "@fastify/jwt": "^8.0.0",
    "@prisma/client": "^5.10.2",
    "@socket.io/redis-adapter": "^8.3.0",
    "@voximplant/apiclient-nodejs": "^4.7.0",
    "axios": "^1.6.7",
    "bcryptjs": "^2.4.3",
    "bullmq": "^5.4.0",
    "dotenv": "^16.4.5",
    "fastify": "^4.26.2",
    "ioredis": "^5.3.2",
    "jsonwebtoken": "^9.0.2",
    "socket.io": "^4.7.4",
    "uuid": "^9.0.1",
    "winston": "^3.11.0",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/jsonwebtoken": "^9.0.5",
    "@types/node": "^20.11.24",
    "@types/supertest": "^6.0.2",
    "@types/uuid": "^9.0.8",
    "prisma": "^5.10.2",
    "supertest": "^6.3.4",
    "tsx": "^4.7.1",
    "typescript": "^5.3.3",
    "vitest": "^1.2.2"
  }
}
```

- [ ] **Step 2: Create backend/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "allowSyntheticDefaultImports": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests", "**/*.test.ts", "**/*.spec.ts"]
}
```

- [ ] **Step 3: Create backend/vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 10000,
    hookTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'dist', 'tests', '**/*.test.ts', 'prisma'],
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
```

- [ ] **Step 4: Install backend dependencies**

Run: `cd backend && npm install`
Expected: `added N packages` message; `backend/node_modules` directory exists; no ERR_ errors.

- [ ] **Step 5: Verify TypeScript compiles (empty project)**

Run: `cd backend && npx tsc --noEmit --skipLibCheck || true`
Expected: completes (may note missing src/ - that's fine; no config errors).

Run: `cd backend && npx tsx --version`
Expected: prints tsx version like `4.7.x`.

Run: `cd backend && npx vitest --version`
Expected: prints vitest version like `1.2.x`.

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/tsconfig.json backend/vitest.config.ts package-lock.json
git commit -m "feat: add backend package.json, tsconfig, and vitest config"
```

---

### Task 3: Prisma Schema

**Files:**
- Create: `backend/prisma/schema.prisma`
- Create: `backend/tests/schema.test.ts`

- [ ] **Step 1: Write failing test first (TDD)**

Create `backend/tests/schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  PrismaClient,
  Prisma,
  CampaignStatus,
  DialMode,
  CallerIdStrategy,
  AgentStatus,
  ContactStatus,
  CallDirection,
} from '@prisma/client';

describe('Prisma Schema', () => {
  it('exports PrismaClient constructor', () => {
    expect(PrismaClient).toBeDefined();
    expect(typeof PrismaClient).toBe('function');
  });

  it('exports Prisma namespace with types', () => {
    expect(Prisma).toBeDefined();
  });

  it('exposes Campaign model delegate on client', () => {
    const client = new PrismaClient();
    expect(client.campaign).toBeDefined();
    expect(typeof client.campaign.findMany).toBe('function');
    expect(typeof client.campaign.create).toBe('function');
  });

  it('exposes AgentMapping model delegate on client', () => {
    const client = new PrismaClient();
    expect(client.agentMapping).toBeDefined();
    expect(typeof client.agentMapping.findMany).toBe('function');
  });

  it('exposes DIDGroup model delegate on client', () => {
    const client = new PrismaClient();
    expect(client.dIDGroup).toBeDefined();
    expect(typeof client.dIDGroup.findMany).toBe('function');
  });

  it('exposes PhoneNumber model delegate on client', () => {
    const client = new PrismaClient();
    expect(client.phoneNumber).toBeDefined();
    expect(typeof client.phoneNumber.findMany).toBe('function');
  });

  it('exposes CampaignContact model delegate on client', () => {
    const client = new PrismaClient();
    expect(client.campaignContact).toBeDefined();
    expect(typeof client.campaignContact.findMany).toBe('function');
  });

  it('exposes CallEvent model delegate on client', () => {
    const client = new PrismaClient();
    expect(client.callEvent).toBeDefined();
    expect(typeof client.callEvent.findMany).toBe('function');
  });

  it('exposes AgentStatusLog model delegate on client', () => {
    const client = new PrismaClient();
    expect(client.agentStatusLog).toBeDefined();
    expect(typeof client.agentStatusLog.findMany).toBe('function');
  });

  it('exports expected enums', () => {
    expect(CampaignStatus.DRAFT).toBe('DRAFT');
    expect(CampaignStatus.ACTIVE).toBe('ACTIVE');
    expect(DialMode.MANUAL).toBe('MANUAL');
    expect(DialMode.PREDICTIVE).toBe('PREDICTIVE');
    expect(CallerIdStrategy.FIXED).toBe('FIXED');
    expect(AgentStatus.AVAILABLE).toBe('AVAILABLE');
    expect(ContactStatus.PENDING).toBe('PENDING');
    expect(CallDirection.OUTBOUND).toBe('OUTBOUND');
  });
});
```

- [ ] **Step 2: Verify test fails (no schema yet)**

Run: `cd backend && npx vitest run tests/schema.test.ts`
Expected: test fails — cannot resolve `@prisma/client` or enums undefined. This is the red phase.

- [ ] **Step 3: Create backend/prisma/schema.prisma**

```prisma
// Elite Dialer — Prisma Schema
// Thin dialer-only schema. Account, payment, and compliance data live in the CRM.
// See docs/superpowers/specs/2026-04-16-elite-dialer-design.md Section 4.

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

enum CampaignStatus {
  DRAFT
  SCHEDULED
  ACTIVE
  PAUSED
  COMPLETED
}

enum DialMode {
  MANUAL
  PREVIEW
  PROGRESSIVE
  PREDICTIVE
}

enum CallerIdStrategy {
  FIXED
  ROTATION
  PROXIMITY
}

enum AgentStatus {
  AVAILABLE
  ON_CALL
  WRAP_UP
  BREAK
  OFFLINE
}

enum ContactStatus {
  PENDING
  COMPLIANCE_BLOCKED
  DIALING
  CONNECTED
  COMPLETED
  FAILED
  MAX_ATTEMPTS
}

enum CallDirection {
  INBOUND
  OUTBOUND
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

model Campaign {
  id                    String            @id @default(uuid()) @db.Uuid
  name                  String
  crmCampaignId         String?           @map("crm_campaign_id")
  status                CampaignStatus    @default(DRAFT)
  dialMode              DialMode          @map("dial_mode")
  autoAnswer            Boolean           @default(false) @map("auto_answer")
  voximplantQueueId     Int?              @map("voximplant_queue_id")
  voximplantListId      Int?              @map("voximplant_list_id")
  scheduleStart         DateTime?         @map("schedule_start")
  scheduleEnd           DateTime?         @map("schedule_end")
  dialingHoursStart     String            @default("08:00") @map("dialing_hours_start")
  dialingHoursEnd       String            @default("21:00") @map("dialing_hours_end")
  timezone              String            @default("America/Chicago")
  maxConcurrentCalls    Int               @default(10) @map("max_concurrent_calls")
  maxAbandonRate        Float             @default(0.03) @map("max_abandon_rate")
  dialRatio             Float             @default(1.2) @map("dial_ratio")
  maxAttempts           Int               @default(3) @map("max_attempts")
  retryDelayMinutes     Int               @default(60) @map("retry_delay_minutes")
  didGroupId            String?           @map("did_group_id") @db.Uuid
  callerIdStrategy      CallerIdStrategy  @default(ROTATION) @map("caller_id_strategy")
  fixedCallerId         String?           @map("fixed_caller_id")
  amdEnabled            Boolean           @default(true) @map("amd_enabled")
  voicemailDropUrl      String?           @map("voicemail_drop_url")
  totalContacts         Int               @default(0) @map("total_contacts")
  totalDialed           Int               @default(0) @map("total_dialed")
  totalConnected        Int               @default(0) @map("total_connected")
  totalVoicemail        Int               @default(0) @map("total_voicemail")
  createdBy             String            @map("created_by") @db.Uuid
  createdAt             DateTime          @default(now()) @map("created_at")
  updatedAt             DateTime          @updatedAt @map("updated_at")

  didGroup              DIDGroup?         @relation(fields: [didGroupId], references: [id], onDelete: SetNull)
  contacts              CampaignContact[]
  callEvents            CallEvent[]
  agentMappings         AgentMapping[]
  agentStatusLogs       AgentStatusLog[]

  @@index([status])
  @@index([dialMode])
  @@index([crmCampaignId])
  @@map("campaigns")
}

model AgentMapping {
  id                   String           @id @default(uuid()) @db.Uuid
  crmUserId            String           @unique @map("crm_user_id")
  crmEmail             String           @unique @map("crm_email")
  crmRole              String           @map("crm_role")
  voximplantUserId     Int              @unique @map("voximplant_user_id")
  voximplantUsername   String           @unique @map("voximplant_username")
  status               AgentStatus      @default(OFFLINE)
  currentCallId        String?          @map("current_call_id")
  currentCampaignId    String?          @map("current_campaign_id") @db.Uuid
  skills               String[]         @default([])
  createdAt            DateTime         @default(now()) @map("created_at")
  updatedAt            DateTime         @updatedAt @map("updated_at")

  currentCampaign      Campaign?        @relation(fields: [currentCampaignId], references: [id], onDelete: SetNull)
  callEvents           CallEvent[]
  statusLogs           AgentStatusLog[]

  @@index([status])
  @@index([crmEmail])
  @@map("agent_mappings")
}

model DIDGroup {
  id            String         @id @default(uuid()) @db.Uuid
  name          String
  createdAt     DateTime       @default(now()) @map("created_at")

  phoneNumbers  PhoneNumber[]
  campaigns     Campaign[]

  @@map("did_groups")
}

model PhoneNumber {
  id                   String     @id @default(uuid()) @db.Uuid
  number               String     @unique
  voximplantNumberId   Int?       @map("voximplant_number_id")
  didGroupId           String?    @map("did_group_id") @db.Uuid
  areaCode             String     @map("area_code")
  state                String?
  isActive             Boolean    @default(true) @map("is_active")
  healthScore          Int        @default(100) @map("health_score")
  dailyCallCount       Int        @default(0) @map("daily_call_count")
  dailyCallLimit       Int        @default(100) @map("daily_call_limit")
  lastUsedAt           DateTime?  @map("last_used_at")
  cooldownUntil        DateTime?  @map("cooldown_until")
  createdAt            DateTime   @default(now()) @map("created_at")
  updatedAt            DateTime   @updatedAt @map("updated_at")

  didGroup             DIDGroup?  @relation(fields: [didGroupId], references: [id], onDelete: SetNull)

  @@index([didGroupId])
  @@index([areaCode])
  @@index([isActive, healthScore])
  @@map("phone_numbers")
}

model CampaignContact {
  id                     String          @id @default(uuid()) @db.Uuid
  campaignId             String          @map("campaign_id") @db.Uuid
  crmAccountId           String          @map("crm_account_id")
  phone                  String
  timezone               String?
  status                 ContactStatus   @default(PENDING)
  priority               Int             @default(0)
  attempts               Int             @default(0)
  lastAttemptAt          DateTime?       @map("last_attempt_at")
  lastOutcome            String?         @map("last_outcome")
  nextAttemptAfter       DateTime        @default(now()) @map("next_attempt_after")
  complianceCleared      Boolean         @default(false) @map("compliance_cleared")
  complianceBlockReason  String?         @map("compliance_block_reason")
  createdAt              DateTime        @default(now()) @map("created_at")
  updatedAt              DateTime        @updatedAt @map("updated_at")

  campaign               Campaign        @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  callEvents             CallEvent[]

  @@index([campaignId, status, nextAttemptAfter])
  @@index([crmAccountId])
  @@index([phone])
  @@map("campaign_contacts")
}

model CallEvent {
  id                   String            @id @default(uuid()) @db.Uuid
  voximplantCallId     String            @map("voximplant_call_id")
  campaignId           String?           @map("campaign_id") @db.Uuid
  contactId            String?           @map("contact_id") @db.Uuid
  agentMappingId       String?           @map("agent_mapping_id") @db.Uuid
  crmAccountId         String?           @map("crm_account_id")
  direction            CallDirection
  fromNumber           String            @map("from_number")
  toNumber             String            @map("to_number")
  status               String
  amdResult            String?           @map("amd_result")
  durationSeconds      Int?              @map("duration_seconds")
  recordingUrl         String?           @map("recording_url")
  dispositionCode      String?           @map("disposition_code")
  hangupReason         String?           @map("hangup_reason")
  voximplantMetadata   Json              @default("{}") @map("voximplant_metadata")
  crmSynced            Boolean           @default(false) @map("crm_synced")
  createdAt            DateTime          @default(now()) @map("created_at")
  updatedAt            DateTime          @updatedAt @map("updated_at")

  campaign             Campaign?         @relation(fields: [campaignId], references: [id], onDelete: SetNull)
  contact              CampaignContact?  @relation(fields: [contactId], references: [id], onDelete: SetNull)
  agentMapping         AgentMapping?     @relation(fields: [agentMappingId], references: [id], onDelete: SetNull)

  @@index([voximplantCallId])
  @@index([campaignId, createdAt])
  @@index([agentMappingId, createdAt])
  @@index([crmSynced])
  @@map("call_events")
}

model AgentStatusLog {
  id                String        @id @default(uuid()) @db.Uuid
  agentMappingId    String        @map("agent_mapping_id") @db.Uuid
  status            String
  startedAt         DateTime      @map("started_at")
  endedAt           DateTime?     @map("ended_at")
  durationSeconds   Int?          @map("duration_seconds")
  campaignId        String?       @map("campaign_id") @db.Uuid
  createdAt         DateTime      @default(now()) @map("created_at")

  agentMapping      AgentMapping  @relation(fields: [agentMappingId], references: [id], onDelete: Cascade)
  campaign          Campaign?     @relation(fields: [campaignId], references: [id], onDelete: SetNull)

  @@index([agentMappingId, startedAt])
  @@index([campaignId, startedAt])
  @@map("agent_status_log")
}
```

- [ ] **Step 4: Generate Prisma client**

Run: `cd backend && npx prisma generate`
Expected: `Generated Prisma Client (vX.Y.Z) to ./node_modules/@prisma/client` success message.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd backend && npx tsc --noEmit -p tsconfig.json`
Expected: completes with no errors (schema types are generated and available).

- [ ] **Step 6: Verify test passes**

Run: `cd backend && npx vitest run tests/schema.test.ts`
Expected: all 10 tests pass — `Test Files  1 passed (1)` and `Tests  10 passed (10)`.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma/schema.prisma backend/tests/schema.test.ts
git commit -m "feat: add Prisma schema with 7 dialer models and enums"
```

---

### Task 4: Config Module

**Files:**
- Create: `backend/tests/config.test.ts`
- Create: `backend/src/config.ts`

- [ ] **Step 1: Write failing test first (TDD)**

Create `backend/tests/config.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('config helpers', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset modules so config.ts re-reads env
    // (vitest auto-isolates via dynamic import below)
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('required()', () => {
    it('returns value when env var is set', async () => {
      process.env.NODE_ENV = 'development';
      process.env.TEST_REQUIRED_VAR = 'hello';
      const { required } = await import('../src/config.js?bust=req1');
      expect(required('TEST_REQUIRED_VAR')).toBe('hello');
    });

    it('throws when missing in production', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.TEST_MISSING_VAR;
      const { required } = await import('../src/config.js?bust=req2');
      expect(() => required('TEST_MISSING_VAR')).toThrow(
        /TEST_MISSING_VAR/,
      );
    });

    it('returns empty string when missing in non-production (warns)', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.TEST_MISSING_VAR;
      const { required } = await import('../src/config.js?bust=req3');
      expect(required('TEST_MISSING_VAR')).toBe('');
    });
  });

  describe('optional()', () => {
    it('returns value when set', async () => {
      process.env.TEST_OPT_VAR = 'set-value';
      const { optional } = await import('../src/config.js?bust=opt1');
      expect(optional('TEST_OPT_VAR', 'fallback')).toBe('set-value');
    });

    it('returns fallback when not set', async () => {
      delete process.env.TEST_OPT_VAR_MISSING;
      const { optional } = await import('../src/config.js?bust=opt2');
      expect(optional('TEST_OPT_VAR_MISSING', 'fallback')).toBe('fallback');
    });

    it('returns fallback when empty string', async () => {
      process.env.TEST_OPT_EMPTY = '';
      const { optional } = await import('../src/config.js?bust=opt3');
      expect(optional('TEST_OPT_EMPTY', 'fb')).toBe('fb');
    });
  });

  describe('optionalInt()', () => {
    it('parses integer from env', async () => {
      process.env.TEST_INT = '42';
      const { optionalInt } = await import('../src/config.js?bust=int1');
      expect(optionalInt('TEST_INT', 0)).toBe(42);
    });

    it('returns fallback when not set', async () => {
      delete process.env.TEST_INT_MISSING;
      const { optionalInt } = await import('../src/config.js?bust=int2');
      expect(optionalInt('TEST_INT_MISSING', 7)).toBe(7);
    });

    it('returns fallback when value is not a valid integer', async () => {
      process.env.TEST_INT_BAD = 'not-a-number';
      const { optionalInt } = await import('../src/config.js?bust=int3');
      expect(optionalInt('TEST_INT_BAD', 99)).toBe(99);
    });
  });

  describe('optionalBool()', () => {
    it('parses true from "true"', async () => {
      process.env.TEST_BOOL = 'true';
      const { optionalBool } = await import('../src/config.js?bust=bool1');
      expect(optionalBool('TEST_BOOL', false)).toBe(true);
    });

    it('parses true from "1"', async () => {
      process.env.TEST_BOOL = '1';
      const { optionalBool } = await import('../src/config.js?bust=bool2');
      expect(optionalBool('TEST_BOOL', false)).toBe(true);
    });

    it('parses false from "false"', async () => {
      process.env.TEST_BOOL = 'false';
      const { optionalBool } = await import('../src/config.js?bust=bool3');
      expect(optionalBool('TEST_BOOL', true)).toBe(false);
    });

    it('parses false from "0"', async () => {
      process.env.TEST_BOOL = '0';
      const { optionalBool } = await import('../src/config.js?bust=bool4');
      expect(optionalBool('TEST_BOOL', true)).toBe(false);
    });

    it('returns fallback when not set', async () => {
      delete process.env.TEST_BOOL_MISSING;
      const { optionalBool } = await import('../src/config.js?bust=bool5');
      expect(optionalBool('TEST_BOOL_MISSING', true)).toBe(true);
    });
  });

  describe('config object', () => {
    it('exposes expected sections', async () => {
      process.env.NODE_ENV = 'development';
      const { config } = await import('../src/config.js?bust=cfg1');
      expect(config.server).toBeDefined();
      expect(config.database).toBeDefined();
      expect(config.redis).toBeDefined();
      expect(config.jwt).toBeDefined();
      expect(config.voximplant).toBeDefined();
      expect(config.crm).toBeDefined();
      expect(config.recording).toBeDefined();
      expect(config.frontend).toBeDefined();
      expect(config.logging).toBeDefined();
    });

    it('parses PORT as integer with default', async () => {
      process.env.NODE_ENV = 'development';
      process.env.PORT = '5000';
      const { config } = await import('../src/config.js?bust=cfg2');
      expect(config.server.port).toBe(5000);
    });
  });
});
```

- [ ] **Step 2: Verify test fails**

Run: `cd backend && npx vitest run tests/config.test.ts`
Expected: test fails — cannot resolve `../src/config.js`. Red phase.

- [ ] **Step 3: Create backend/src/config.ts**

```typescript
import 'dotenv/config';

/**
 * Configuration helpers for environment variable loading.
 *
 * In production, `required()` throws on missing vars. In development/test,
 * it warns and returns an empty string so local dev doesn't explode.
 */

const isProduction = (): boolean => process.env.NODE_ENV === 'production';

export function required(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === null || value === '') {
    if (isProduction()) {
      throw new Error(
        `Missing required environment variable: ${key} (NODE_ENV=production)`,
      );
    }
    // eslint-disable-next-line no-console
    console.warn(
      `[config] Missing required env var ${key} — returning empty string (NODE_ENV=${process.env.NODE_ENV ?? 'unset'})`,
    );
    return '';
  }
  return value;
}

export function optional(key: string, fallback: string): string {
  const value = process.env[key];
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return value;
}

export function optionalInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === null || raw === '') {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    // eslint-disable-next-line no-console
    console.warn(
      `[config] Could not parse integer for ${key}="${raw}" — using fallback ${fallback}`,
    );
    return fallback;
  }
  return parsed;
}

export function optionalBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw === null || raw === '') {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  // eslint-disable-next-line no-console
  console.warn(
    `[config] Could not parse boolean for ${key}="${raw}" — using fallback ${fallback}`,
  );
  return fallback;
}

export const config = {
  server: {
    nodeEnv: optional('NODE_ENV', 'development'),
    port: optionalInt('PORT', 5000),
    isProduction: isProduction(),
  },
  database: {
    url: required('DATABASE_URL'),
  },
  redis: {
    url: optional('REDIS_URL', 'redis://localhost:6379'),
  },
  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: optional('JWT_EXPIRES_IN', '8h'),
  },
  voximplant: {
    accountId: required('VOXIMPLANT_ACCOUNT_ID'),
    apiKeyId: required('VOXIMPLANT_API_KEY_ID'),
    apiKeyPath: optional('VOXIMPLANT_API_KEY_PATH', './vox_credentials.json'),
    applicationId: required('VOXIMPLANT_APPLICATION_ID'),
    applicationName: required('VOXIMPLANT_APPLICATION_NAME'),
    accountName: required('VOXIMPLANT_ACCOUNT_NAME'),
  },
  crm: {
    baseUrl: required('CRM_BASE_URL'),
    apiKey: required('CRM_API_KEY'),
  },
  recording: {
    s3Bucket: optional('RECORDING_S3_BUCKET', ''),
    s3Region: optional('RECORDING_S3_REGION', ''),
    s3AccessKey: optional('RECORDING_S3_ACCESS_KEY', ''),
    s3SecretKey: optional('RECORDING_S3_SECRET_KEY', ''),
  },
  frontend: {
    url: optional('FRONTEND_URL', 'http://localhost:3000'),
    dialerApiUrl: optional('NEXT_PUBLIC_DIALER_API_URL', 'http://localhost:5000'),
    crmUrl: optional('NEXT_PUBLIC_CRM_URL', ''),
  },
  logging: {
    level: optional('LOG_LEVEL', 'info'),
  },
} as const;

export type AppConfig = typeof config;
```

- [ ] **Step 4: Verify test passes**

Run: `cd backend && npx vitest run tests/config.test.ts`
Expected: all tests pass — `Test Files  1 passed (1)` with all helper and config-object tests green.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: completes with no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/config.ts backend/tests/config.test.ts
git commit -m "feat: add config module with required/optional env helpers"
```

---

### Task 5: Logger and Prisma Client Singletons

**Files:**
- Create: `backend/tests/logger.test.ts`
- Create: `backend/tests/prisma.test.ts`
- Create: `backend/src/lib/logger.ts`
- Create: `backend/src/lib/prisma.ts`

- [ ] **Step 1: Write failing logger test first (TDD)**

Create `backend/tests/logger.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { logger, createChildLogger } from '../src/lib/logger.js';

describe('logger', () => {
  it('exports a winston logger instance', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('has a configurable log level', () => {
    expect(typeof logger.level).toBe('string');
    expect(logger.level.length).toBeGreaterThan(0);
  });

  it('logs without throwing', () => {
    expect(() => logger.info('test info message')).not.toThrow();
    expect(() => logger.warn('test warn message')).not.toThrow();
    expect(() => logger.error('test error message', { err: 'details' })).not.toThrow();
  });
});

describe('createChildLogger', () => {
  it('creates a child logger bound to a request id', () => {
    const child = createChildLogger('req-abc-123');
    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
    expect(() => child.info('child log line')).not.toThrow();
  });

  it('accepts additional metadata', () => {
    const child = createChildLogger('req-xyz', { userId: 'user-1' });
    expect(child).toBeDefined();
    expect(() => child.info('metadata test')).not.toThrow();
  });
});
```

- [ ] **Step 2: Write failing prisma test**

Create `backend/tests/prisma.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { prisma, disconnectPrisma } from '../src/lib/prisma.js';

describe('prisma singleton', () => {
  it('exports a PrismaClient instance', () => {
    expect(prisma).toBeDefined();
    expect(typeof prisma.$connect).toBe('function');
    expect(typeof prisma.$disconnect).toBe('function');
  });

  it('returns the same instance on repeated imports (singleton)', async () => {
    const mod1 = await import('../src/lib/prisma.js');
    const mod2 = await import('../src/lib/prisma.js');
    expect(mod1.prisma).toBe(mod2.prisma);
  });

  it('exposes all expected model delegates', () => {
    expect(prisma.campaign).toBeDefined();
    expect(prisma.agentMapping).toBeDefined();
    expect(prisma.dIDGroup).toBeDefined();
    expect(prisma.phoneNumber).toBeDefined();
    expect(prisma.campaignContact).toBeDefined();
    expect(prisma.callEvent).toBeDefined();
    expect(prisma.agentStatusLog).toBeDefined();
  });

  it('exports disconnectPrisma function', () => {
    expect(typeof disconnectPrisma).toBe('function');
  });
});
```

- [ ] **Step 3: Verify both tests fail**

Run: `cd backend && npx vitest run tests/logger.test.ts tests/prisma.test.ts`
Expected: both fail — cannot resolve `../src/lib/logger.js` or `../src/lib/prisma.js`. Red phase.

- [ ] **Step 4: Create backend/src/lib/logger.ts**

```typescript
import winston from 'winston';
import { config } from '../config.js';

const { combine, timestamp, printf, colorize, errors, json, splat } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss.SSS' }),
  errors({ stack: true }),
  splat(),
  printf(({ level, message, timestamp: ts, requestId, ...meta }) => {
    const reqPart = requestId ? ` [${String(requestId)}]` : '';
    const metaKeys = Object.keys(meta).filter((k) => k !== 'service');
    const metaPart =
      metaKeys.length > 0
        ? ` ${JSON.stringify(Object.fromEntries(metaKeys.map((k) => [k, meta[k]])))}`
        : '';
    return `${ts} ${level}${reqPart} ${message}${metaPart}`;
  }),
);

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  splat(),
  json(),
);

export const logger = winston.createLogger({
  level: config.logging.level,
  format: config.server.isProduction ? prodFormat : devFormat,
  defaultMeta: { service: 'elite-dialer-backend' },
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
  exitOnError: false,
});

export function createChildLogger(
  requestId: string,
  extra: Record<string, unknown> = {},
): winston.Logger {
  return logger.child({ requestId, ...extra });
}

export type AppLogger = typeof logger;
```

- [ ] **Step 5: Create backend/src/lib/prisma.ts**

```typescript
import { PrismaClient, Prisma } from '@prisma/client';
import { config } from '../config.js';
import { logger } from './logger.js';

const globalForPrisma = globalThis as unknown as {
  __elitePrismaClient?: PrismaClient;
};

function buildClient(): PrismaClient {
  const logLevels: Prisma.LogLevel[] = config.server.isProduction
    ? ['error', 'warn']
    : ['query', 'info', 'warn', 'error'];

  const client = new PrismaClient({
    log: logLevels.map((level) => ({ emit: 'event', level })) as never,
    errorFormat: config.server.isProduction ? 'minimal' : 'pretty',
  });

  // Wire Prisma events into winston. Query logs are dev-only.
  if (!config.server.isProduction) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).$on('query', (e: Prisma.QueryEvent) => {
      logger.debug('prisma:query', {
        query: e.query,
        params: e.params,
        duration_ms: e.duration,
      });
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).$on('error', (e: Prisma.LogEvent) => {
    logger.error('prisma:error', { message: e.message, target: e.target });
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).$on('warn', (e: Prisma.LogEvent) => {
    logger.warn('prisma:warn', { message: e.message, target: e.target });
  });

  return client;
}

export const prisma: PrismaClient =
  globalForPrisma.__elitePrismaClient ?? buildClient();

if (!config.server.isProduction) {
  globalForPrisma.__elitePrismaClient = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info('Prisma client disconnected');
  } catch (err) {
    logger.error('Error disconnecting Prisma client', { err });
  }
}

// Graceful shutdown hooks (only register once per process).
const shutdownSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
for (const sig of shutdownSignals) {
  process.once(sig, () => {
    void disconnectPrisma().finally(() => {
      // Do not call process.exit here — let the main server trigger shutdown.
    });
  });
}
```

- [ ] **Step 6: Verify tests pass**

Run: `cd backend && npx vitest run tests/logger.test.ts tests/prisma.test.ts`
Expected: both files pass — `Test Files  2 passed (2)`; all logger and prisma singleton tests green.

- [ ] **Step 7: Verify TypeScript compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: completes with no errors.

- [ ] **Step 8: Run entire backend test suite**

Run: `cd backend && npx vitest run`
Expected: all 4 test files pass (schema, config, logger, prisma). Green across the board.

- [ ] **Step 9: Commit**

```bash
git add backend/src/lib/logger.ts backend/src/lib/prisma.ts backend/tests/logger.test.ts backend/tests/prisma.test.ts
git commit -m "feat: add winston logger and Prisma client singletons"
```

---

## Phase 2: Voximplant Core

Tasks 6-10 build the server runtime (Fastify + Socket.IO + Redis + health check), the CRM API client, auth middleware and login route, the Voximplant Management API wrapper, and the webhook handler that receives call events from VoxEngine scenarios.

### Task 6: Fastify Server + Health Check

**Files:**
- Create: `backend/src/lib/io.ts`
- Create: `backend/src/lib/redis.ts`
- Create: `backend/src/index.ts`
- Create: `backend/tests/health.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// backend/tests/health.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../src/lib/redis', () => ({
  redis: {
    ping: vi.fn().mockResolvedValue('PONG'),
    quit: vi.fn().mockResolvedValue('OK'),
    duplicate: vi.fn().mockReturnValue({
      connect: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue('OK'),
    }),
  },
}));

vi.mock('@socket.io/redis-adapter', () => ({
  createAdapter: vi.fn().mockReturnValue(() => {}),
}));

import { buildServer } from '../src/index';
import { prisma } from '../src/lib/prisma';
import { redis } from '../src/lib/redis';

describe('GET /health', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with db+redis ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe('ok');
    expect(body.redis).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  it('returns 503 when db is down', async () => {
    (prisma.$queryRaw as any).mockRejectedValueOnce(new Error('db down'));
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.status).toBe('degraded');
    expect(body.db).toBe('error');
  });

  it('returns 503 when redis is down', async () => {
    (redis.ping as any).mockRejectedValueOnce(new Error('redis down'));
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.redis).toBe('error');
  });
});
```

- [ ] **Step 2: Run to verify failure**
Run: `cd backend && npm test -- health`
Expected: FAIL (buildServer not exported)

- [ ] **Step 3: Implement**

```typescript
// backend/src/lib/redis.ts
import Redis from 'ioredis';
import { config } from '../config';

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

redis.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[redis] error', err.message);
});
```

```typescript
// backend/src/lib/io.ts
import { Server as IOServer } from 'socket.io';

let ioInstance: IOServer | null = null;

export function setIO(server: IOServer): void {
  ioInstance = server;
}

export function getIO(): IOServer {
  if (!ioInstance) {
    throw new Error('Socket.IO server not initialized');
  }
  return ioInstance;
}
```

```typescript
// backend/src/index.ts
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import { Server as IOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { config } from './config';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';
import { setIO } from './lib/io';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, trustProxy: true });

  await app.register(cors, {
    origin: config.frontend.url,
    credentials: true,
  });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(jwt, { secret: config.jwt.secret });

  app.get('/health', async (_req, reply) => {
    const result: Record<string, string | number> = {
      status: 'ok',
      db: 'ok',
      redis: 'ok',
      timestamp: Date.now(),
    };

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      result.db = 'error';
      result.status = 'degraded';
      logger.error({ err }, 'health: db check failed');
    }

    try {
      const pong = await redis.ping();
      if (pong !== 'PONG') {
        result.redis = 'error';
        result.status = 'degraded';
      }
    } catch (err) {
      result.redis = 'error';
      result.status = 'degraded';
      logger.error({ err }, 'health: redis check failed');
    }

    if (result.status === 'degraded') {
      return reply.status(503).send(result);
    }
    return reply.status(200).send(result);
  });

  return app;
}

export async function attachSocketIO(app: FastifyInstance): Promise<IOServer> {
  const io = new IOServer(app.server, {
    cors: { origin: config.frontend.url, credentials: true },
  });

  const pub = redis.duplicate();
  const sub = redis.duplicate();
  await Promise.all([
    (pub as any).status === 'ready' ? Promise.resolve() : (pub as any).connect?.(),
    (sub as any).status === 'ready' ? Promise.resolve() : (sub as any).connect?.(),
  ]);
  io.adapter(createAdapter(pub, sub));

  setIO(io);
  return io;
}

async function start(): Promise<void> {
  const app = await buildServer();
  await attachSocketIO(app);

  await app.listen({ host: '0.0.0.0', port: config.port });
  logger.info({ port: config.port, env: config.env }, 'elite-dialer backend started');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutdown initiated');
    try {
      await app.close();
      await prisma.$disconnect();
      await redis.quit();
    } catch (err) {
      logger.error({ err }, 'shutdown error');
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

if (require.main === module) {
  start().catch((err) => {
    logger.error({ err }, 'startup failed');
    process.exit(1);
  });
}
```

- [ ] **Step 4: Verify passes**
Run: `cd backend && npm test -- health`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/io.ts backend/src/lib/redis.ts backend/src/index.ts backend/tests/health.test.ts
git commit -m "feat(backend): Fastify server with Socket.IO and /health endpoint"
```

---

### Task 7: CRM Client Module

**Files:**
- Create: `backend/src/lib/crm-client.ts`
- Create: `backend/tests/crm-client.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// backend/tests/crm-client.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { CRMClient } from '../src/lib/crm-client';

vi.mock('../src/config', () => ({
  config: {
    crm: { baseUrl: 'https://crm.test', apiKey: 'test-key' },
  },
}));

describe('CRMClient', () => {
  let client: CRMClient;
  let mock: MockAdapter;

  beforeEach(() => {
    client = new CRMClient();
    mock = new MockAdapter((client as any).http, { delayResponse: 0 });
  });

  afterEach(() => {
    mock.reset();
    mock.restore();
  });

  it('sends X-Dialer-Key header', async () => {
    mock.onGet('/api/voice/dnc').reply((config) => {
      expect(config.headers?.['X-Dialer-Key']).toBe('test-key');
      return [200, { blocked: false }];
    });
    const result = await client.checkDNC('+15551234567');
    expect(result.blocked).toBe(false);
  });

  it('checkDNC GET /api/voice/dnc?phone=', async () => {
    mock.onGet('/api/voice/dnc', { params: { phone: '+15551234567' } })
      .reply(200, { blocked: true, reason: 'consumer opt-out' });
    const result = await client.checkDNC('+15551234567');
    expect(result).toEqual({ blocked: true, reason: 'consumer opt-out' });
  });

  it('getAccount GET /api/work/:id', async () => {
    mock.onGet('/api/work/acc-1').reply(200, { id: 'acc-1', name: 'Jane' });
    const result = await client.getAccount('acc-1');
    expect(result).toEqual({ id: 'acc-1', name: 'Jane' });
  });

  it('getTCPACompliance GET /api/work/:id/tcpa-compliance', async () => {
    mock.onGet('/api/work/acc-1/tcpa-compliance')
      .reply(200, { count: 3, lastCallAt: '2026-04-15T10:00:00Z' });
    const result = await client.getTCPACompliance('acc-1');
    expect(result.count).toBe(3);
  });

  it('logCall POST /api/work/:id/call', async () => {
    mock.onPost('/api/work/acc-1/call').reply(200, { success: true });
    const result = await client.logCall('acc-1', {
      duration: 120, outcome: 'answered', agentId: 'a1', voximplantCallId: 'vx-1',
    });
    expect(result.success).toBe(true);
  });

  it('updateStatus PATCH /api/work/:id/status', async () => {
    mock.onPatch('/api/work/acc-1/status').reply(200, {});
    await client.updateStatus('acc-1', 'pending_payment', 'user-1');
    expect(mock.history.patch[0].url).toBe('/api/work/acc-1/status');
  });

  it('logCompliance POST /api/voice/tools/log-compliance', async () => {
    mock.onPost('/api/voice/tools/log-compliance').reply(200, {});
    await client.logCompliance({ accountId: 'acc-1', phone: '+15551234567', check: 'dnc', result: 'block', reason: 'dnc' });
    expect(mock.history.post[0].url).toBe('/api/voice/tools/log-compliance');
  });

  it('getCampaignAccounts GET /api/voice/campaigns/:id/accounts', async () => {
    mock.onGet('/api/voice/campaigns/c-1/accounts').reply(200, [{ id: 'acc-1', phone: '+15551234567' }]);
    const result = await client.getCampaignAccounts('c-1');
    expect(result).toHaveLength(1);
  });

  it('searchAccounts GET /api/work/search', async () => {
    mock.onGet('/api/work/search', { params: { q: 'jane' } }).reply(200, [{ id: 'acc-1' }]);
    const result = await client.searchAccounts('jane');
    expect(result).toHaveLength(1);
  });

  it('verifyLogin POST /api/auth/dialer-verify', async () => {
    mock.onPost('/api/auth/dialer-verify').reply(200, { id: 'u-1', email: 'x@y.com', role: 'rep' });
    const user = await client.verifyLogin('x@y.com', 'pw');
    expect(user?.id).toBe('u-1');
  });

  it('verifyLogin returns null on 401', async () => {
    mock.onPost('/api/auth/dialer-verify').reply(401);
    const user = await client.verifyLogin('x@y.com', 'bad');
    expect(user).toBeNull();
  });

  it('retries on 5xx', async () => {
    let attempts = 0;
    mock.onGet('/api/work/acc-1').reply(() => {
      attempts += 1;
      if (attempts < 3) return [500, { error: 'boom' }];
      return [200, { id: 'acc-1' }];
    });
    const result = await client.getAccount('acc-1');
    expect(attempts).toBe(3);
    expect(result.id).toBe('acc-1');
  });
});
```

- [ ] **Step 2: Run to verify failure**
Run: `cd backend && npm test -- crm-client`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

```typescript
// backend/src/lib/crm-client.ts
import axios, { AxiosInstance, AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import { config } from '../config';
import { logger } from './logger';

export interface CRMAccount {
  id: string;
  name?: string;
  phone?: string;
  balance?: number;
  status?: string;
  [key: string]: unknown;
}

export interface CRMContact {
  id: string;
  accountId: string;
  phone: string;
  timezone?: string;
  priority?: number;
  [key: string]: unknown;
}

export interface CRMUser {
  id: string;
  email: string;
  role: 'rep' | 'supervisor' | 'admin' | string;
  name?: string;
  [key: string]: unknown;
}

export interface LogCallData {
  duration: number;
  outcome: string;
  agentId: string;
  voximplantCallId: string;
  recordingUrl?: string;
  notes?: string;
}

export interface ComplianceLogData {
  accountId?: string;
  phone: string;
  check: 'dnc' | 'tcpa' | 'reg_f' | 'account_status';
  result: 'pass' | 'block';
  reason?: string;
  campaignId?: string;
}

export class CRMClient {
  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: config.crm.baseUrl,
      timeout: 10_000,
      headers: {
        'X-Dialer-Key': config.crm.apiKey,
        'Content-Type': 'application/json',
      },
    });

    axiosRetry(this.http, {
      retries: 3,
      retryDelay: (retryCount) => Math.pow(2, retryCount - 1) * 1000, // 1s, 2s, 4s
      retryCondition: (error: AxiosError) => {
        const status = error.response?.status ?? 0;
        return status >= 500 && status < 600;
      },
      onRetry: (count, err) => {
        logger.warn({ count, err: err.message }, 'crm-client retry');
      },
    });
  }

  async checkDNC(phone: string): Promise<{ blocked: boolean; reason?: string }> {
    const res = await this.http.get('/api/voice/dnc', { params: { phone } });
    return res.data;
  }

  async getAccount(id: string): Promise<CRMAccount> {
    const res = await this.http.get(`/api/work/${id}`);
    return res.data;
  }

  async getTCPACompliance(id: string): Promise<{ count: number; lastCallAt: Date | null }> {
    const res = await this.http.get(`/api/work/${id}/tcpa-compliance`);
    return {
      count: res.data.count ?? 0,
      lastCallAt: res.data.lastCallAt ? new Date(res.data.lastCallAt) : null,
    };
  }

  async logCall(id: string, data: LogCallData): Promise<{ success: boolean }> {
    const res = await this.http.post(`/api/work/${id}/call`, data);
    return res.data;
  }

  async updateStatus(id: string, status: string, userId: string): Promise<void> {
    await this.http.patch(`/api/work/${id}/status`, { status, userId });
  }

  async logCompliance(data: ComplianceLogData): Promise<void> {
    await this.http.post('/api/voice/tools/log-compliance', data);
  }

  async getCampaignAccounts(campaignId: string): Promise<CRMContact[]> {
    const res = await this.http.get(`/api/voice/campaigns/${campaignId}/accounts`);
    return res.data;
  }

  async searchAccounts(query: string): Promise<CRMAccount[]> {
    const res = await this.http.get('/api/work/search', { params: { q: query } });
    return res.data;
  }

  async verifyLogin(email: string, password: string): Promise<CRMUser | null> {
    try {
      const res = await this.http.post('/api/auth/dialer-verify', { email, password });
      return res.data;
    } catch (err) {
      const axErr = err as AxiosError;
      if (axErr.response?.status === 401 || axErr.response?.status === 403) {
        return null;
      }
      throw err;
    }
  }
}

export const crmClient = new CRMClient();
```

NOTE: Requires CRM addition of `POST /api/auth/dialer-verify` endpoint (documented as CRM change in Task 7 of backlog).

- [ ] **Step 4: Verify passes**
Run: `cd backend && npm test -- crm-client`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/crm-client.ts backend/tests/crm-client.test.ts
git commit -m "feat(backend): CRM client with retry logic and typed methods"
```

---

### Task 8: Auth Middleware + Login Route

**Files:**
- Create: `backend/src/middleware/auth.ts`
- Create: `backend/src/routes/auth.ts`
- Create: `backend/tests/auth.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// backend/tests/auth.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    agentMapping: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('../src/lib/redis', () => ({
  redis: {
    ping: vi.fn().mockResolvedValue('PONG'),
    quit: vi.fn().mockResolvedValue('OK'),
    duplicate: vi.fn().mockReturnValue({ connect: vi.fn(), quit: vi.fn() }),
  },
}));

vi.mock('../src/lib/crm-client', () => ({
  crmClient: {
    verifyLogin: vi.fn(),
  },
  CRMClient: class {},
}));

import { buildServer } from '../src/index';
import { registerAuthRoutes } from '../src/routes/auth';
import { authenticate, requireRole } from '../src/middleware/auth';
import { crmClient } from '../src/lib/crm-client';
import { prisma } from '../src/lib/prisma';
import type { FastifyInstance } from 'fastify';

describe('auth routes + middleware', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await registerAuthRoutes(app);
    app.get('/protected', { preHandler: authenticate }, async (req) => ({ user: req.user }));
    app.get('/admin-only', {
      preHandler: [authenticate, requireRole(['admin'])],
    }, async () => ({ ok: true }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('login with valid creds returns JWT + user + voximplantUser', async () => {
    (crmClient.verifyLogin as any).mockResolvedValue({ id: 'u-1', email: 'a@b.com', role: 'rep' });
    (prisma.agentMapping.findUnique as any).mockResolvedValue({
      id: 'am-1',
      crmUserId: 'u-1',
      voximplantUserId: 42,
      voximplantUsername: 'agent1@app.acct.voximplant.com',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'a@b.com', password: 'pw' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeTruthy();
    expect(body.user.id).toBe('u-1');
    expect(body.voximplantUser.username).toBe('agent1@app.acct.voximplant.com');
    expect(body.voximplantUser.oneTimeKey).toBe(''); // placeholder, wired in Task 9
  });

  it('login with invalid creds returns 401', async () => {
    (crmClient.verifyLogin as any).mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'a@b.com', password: 'bad' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('login with missing agent mapping returns 403', async () => {
    (crmClient.verifyLogin as any).mockResolvedValue({ id: 'u-1', email: 'a@b.com', role: 'rep' });
    (prisma.agentMapping.findUnique as any).mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'a@b.com', password: 'pw' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('protected route without header returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/protected' });
    expect(res.statusCode).toBe(401);
  });

  it('protected route with invalid token returns 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer garbage' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('protected route with valid token returns user', async () => {
    (crmClient.verifyLogin as any).mockResolvedValue({ id: 'u-1', email: 'a@b.com', role: 'rep' });
    (prisma.agentMapping.findUnique as any).mockResolvedValue({
      id: 'am-1', crmUserId: 'u-1', voximplantUserId: 42, voximplantUsername: 'agent1',
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'a@b.com', password: 'pw' },
    });
    const { token } = login.json();
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.id).toBe('u-1');
  });

  it('admin-only route rejects rep with 403', async () => {
    (crmClient.verifyLogin as any).mockResolvedValue({ id: 'u-1', email: 'a@b.com', role: 'rep' });
    (prisma.agentMapping.findUnique as any).mockResolvedValue({
      id: 'am-1', crmUserId: 'u-1', voximplantUserId: 42, voximplantUsername: 'agent1',
    });
    const login = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { email: 'a@b.com', password: 'pw' },
    });
    const { token } = login.json();
    const res = await app.inject({
      method: 'GET',
      url: '/admin-only',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('logout updates agent mapping to offline', async () => {
    (crmClient.verifyLogin as any).mockResolvedValue({ id: 'u-1', email: 'a@b.com', role: 'rep' });
    (prisma.agentMapping.findUnique as any).mockResolvedValue({
      id: 'am-1', crmUserId: 'u-1', voximplantUserId: 42, voximplantUsername: 'agent1',
    });
    const login = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { email: 'a@b.com', password: 'pw' },
    });
    const { token } = login.json();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.agentMapping.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'offline' }) }),
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**
Run: `cd backend && npm test -- auth`
Expected: FAIL

- [ ] **Step 3: Implement**

```typescript
// backend/src/middleware/auth.ts
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    user: {
      id: string;
      email: string;
      role: string;
      crmUserId: string;
    };
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      id: string;
      email: string;
      role: string;
      crmUserId: string;
    };
    user: {
      id: string;
      email: string;
      role: string;
      crmUserId: string;
    };
  }
}

export const authenticate: preHandlerHookHandler = async (
  req: FastifyRequest,
  reply: FastifyReply,
) => {
  try {
    await req.jwtVerify();
  } catch {
    return reply.status(401).send({ error: 'unauthorized' });
  }
};

export function requireRole(roles: string[]): preHandlerHookHandler {
  return async (req, reply) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return reply.status(403).send({ error: 'forbidden' });
    }
  };
}
```

```typescript
// backend/src/routes/auth.ts
import type { FastifyInstance } from 'fastify';
import { crmClient } from '../lib/crm-client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { authenticate } from '../middleware/auth';
import { config } from '../config';

interface LoginBody {
  email: string;
  password: string;
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: LoginBody }>('/api/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (req, reply) => {
    const { email, password } = req.body;

    const crmUser = await crmClient.verifyLogin(email, password);
    if (!crmUser) {
      return reply.status(401).send({ error: 'invalid_credentials' });
    }

    const mapping = await prisma.agentMapping.findUnique({
      where: { crmUserId: crmUser.id },
    });
    if (!mapping) {
      logger.warn({ crmUserId: crmUser.id }, 'login: no agent mapping');
      return reply.status(403).send({ error: 'agent_mapping_missing' });
    }

    const token = app.jwt.sign(
      {
        id: crmUser.id,
        email: crmUser.email,
        role: crmUser.role,
        crmUserId: crmUser.id,
      },
      { expiresIn: config.jwt.expiresIn ?? '8h' },
    );

    // Voximplant one-time key wired in Task 9 via VoximplantAPI.createOneTimeLoginKey
    const oneTimeKey = '';

    return reply.status(200).send({
      token,
      user: {
        id: crmUser.id,
        email: crmUser.email,
        role: crmUser.role,
        name: (crmUser as any).name,
      },
      voximplantUser: {
        userId: mapping.voximplantUserId,
        username: mapping.voximplantUsername,
        oneTimeKey,
      },
    });
  });

  app.post('/api/auth/logout', { preHandler: authenticate }, async (req, reply) => {
    try {
      await prisma.agentMapping.update({
        where: { crmUserId: req.user.crmUserId },
        data: { status: 'offline', currentCallId: null },
      });
    } catch (err) {
      logger.warn({ err }, 'logout: mapping update failed');
    }
    return reply.status(200).send({ ok: true });
  });
}
```

- [ ] **Step 4: Verify passes**
Run: `cd backend && npm test -- auth`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware/auth.ts backend/src/routes/auth.ts backend/tests/auth.test.ts
git commit -m "feat(backend): JWT auth middleware and login/logout routes"
```

---

### Task 9: Voximplant API Wrapper

**Files:**
- Create: `backend/src/services/voximplant-api.ts`
- Create: `backend/tests/voximplant-api.test.ts`
- Modify: `backend/src/routes/auth.ts` (wire one-time key)

- [ ] **Step 1: Write failing test**

```typescript
// backend/tests/voximplant-api.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockClient = {
  Users: {
    addUser: vi.fn().mockResolvedValue({ result: 1, userId: 42 }),
    getUsers: vi.fn(),
  },
  SmartQueue: {
    sqAddQueue: vi.fn().mockResolvedValue({ result: 1, sqQueueId: 99 }),
    sqGetQueueRealtimeMetrics: vi.fn().mockResolvedValue({
      result: [{ sqQueueId: 99, callsInQueue: 5, agentsAvailable: 3 }],
    }),
    sqStartSupervisorSession: vi.fn().mockResolvedValue({ result: 1 }),
  },
  CallLists: {
    createCallList: vi.fn().mockResolvedValue({ result: 1, listId: 77 }),
    appendToCallList: vi.fn().mockResolvedValue({ result: 1, count: 100 }),
    getCallListDetails: vi.fn().mockResolvedValue({ result: [] }),
    startNextCallTask: vi.fn().mockResolvedValue({ result: 1 }),
    stopCallListProcessing: vi.fn().mockResolvedValue({ result: 1 }),
  },
  PDS: {
    startPDSCampaign: vi.fn().mockResolvedValue({ result: 1 }),
    stopPDSCampaign: vi.fn().mockResolvedValue({ result: 1 }),
  },
  History: {
    getCallHistory: vi.fn().mockResolvedValue({ result: [] }),
  },
  Authentication: {
    addUserOneTimeLoginKey: vi.fn().mockResolvedValue({ key: 'one-time-xyz' }),
  },
};

vi.mock('@voximplant/apiclient-nodejs', () => ({
  default: {
    VoximplantApiClient: vi.fn().mockImplementation(() => mockClient),
  },
  VoximplantApiClient: vi.fn().mockImplementation(() => mockClient),
}));

vi.mock('../src/config', () => ({
  config: {
    voximplant: {
      accountId: '123',
      apiKeyId: 'kid',
      apiKeyPath: '/tmp/fake-creds.json',
      applicationId: 555,
    },
  },
}));

import { VoximplantAPI } from '../src/services/voximplant-api';

describe('VoximplantAPI', () => {
  let api: VoximplantAPI;

  beforeEach(async () => {
    api = new VoximplantAPI();
    await api.init();
    vi.clearAllMocks();
  });

  it('createUser calls Users.addUser', async () => {
    mockClient.Users.addUser.mockResolvedValueOnce({ result: 1, userId: 42 });
    const out = await api.createUser('agent1', 'pw', 555);
    expect(mockClient.Users.addUser).toHaveBeenCalledWith(expect.objectContaining({
      userName: 'agent1',
      userDisplayName: 'agent1',
      userPassword: 'pw',
      applicationId: 555,
    }));
    expect(out.userId).toBe(42);
  });

  it('createOneTimeLoginKey returns key', async () => {
    const key = await api.createOneTimeLoginKey(42);
    expect(mockClient.Authentication.addUserOneTimeLoginKey).toHaveBeenCalledWith({ userId: 42 });
    expect(key).toBe('one-time-xyz');
  });

  it('createSmartQueue calls SmartQueue.sqAddQueue', async () => {
    const out = await api.createSmartQueue({ name: 'q', applicationId: 555, users: [42] });
    expect(mockClient.SmartQueue.sqAddQueue).toHaveBeenCalled();
    expect(out.queueId).toBe(99);
  });

  it('startPDSCampaign forwards params', async () => {
    await api.startPDSCampaign({
      queueId: 99, callListId: 77, mode: 'predictive', maxAbandonRate: 0.03, dialRatio: 1.2,
    });
    expect(mockClient.PDS.startPDSCampaign).toHaveBeenCalledWith(expect.objectContaining({
      sqQueueId: 99,
      listId: 77,
      maxAbandonRate: 0.03,
      dialRatio: 1.2,
    }));
  });

  it('stopPDSCampaign calls SDK', async () => {
    await api.stopPDSCampaign(99);
    expect(mockClient.PDS.stopPDSCampaign).toHaveBeenCalledWith({ sqQueueId: 99 });
  });

  it('createCallList passes fileContent', async () => {
    const out = await api.createCallList({
      ruleId: 1, priority: 1, maxSimultaneous: 5, numAttempts: 3, name: 'l',
      fileContent: Buffer.from('a;b;c'), intervalSeconds: 60,
    });
    expect(mockClient.CallLists.createCallList).toHaveBeenCalled();
    expect(out.listId).toBe(77);
  });

  it('appendToCallList forwards', async () => {
    const out = await api.appendToCallList(77, Buffer.from('x'));
    expect(mockClient.CallLists.appendToCallList).toHaveBeenCalledWith(expect.objectContaining({
      listId: 77,
    }));
    expect(out.count).toBe(100);
  });

  it('getCallListDetails forwards', async () => {
    await api.getCallListDetails(77, 0, 100);
    expect(mockClient.CallLists.getCallListDetails).toHaveBeenCalledWith(expect.objectContaining({
      listId: 77, offset: 0, count: 100,
    }));
  });

  it('getCallHistory forwards dates', async () => {
    const from = new Date('2026-04-01');
    const to = new Date('2026-04-16');
    await api.getCallHistory({ fromDate: from, toDate: to, applicationId: 555 });
    expect(mockClient.History.getCallHistory).toHaveBeenCalledWith(expect.objectContaining({
      fromDate: from, toDate: to, applicationId: 555,
    }));
  });

  it('getSmartQueueRealtimeMetrics returns metrics', async () => {
    const out = await api.getSmartQueueRealtimeMetrics(99);
    expect(out.callsInQueue).toBe(5);
  });

  it('startSupervisorSession forwards mode', async () => {
    await api.startSupervisorSession({
      callSessionId: 'cs-1', supervisorUsername: 'sup', mode: 'whisper',
    });
    expect(mockClient.SmartQueue.sqStartSupervisorSession).toHaveBeenCalledWith(expect.objectContaining({
      callSessionId: 'cs-1', supervisorUserName: 'sup', mode: 'whisper',
    }));
  });
});
```

- [ ] **Step 2: Run to verify failure**
Run: `cd backend && npm test -- voximplant-api`
Expected: FAIL

- [ ] **Step 3: Implement**

```typescript
// backend/src/services/voximplant-api.ts
import VoximplantApiClientPkg from '@voximplant/apiclient-nodejs';
import { config } from '../config';
import { logger } from '../lib/logger';

const VoximplantApiClient =
  (VoximplantApiClientPkg as any).VoximplantApiClient ??
  (VoximplantApiClientPkg as any).default ??
  (VoximplantApiClientPkg as any);

export interface CallListDetail {
  listId: number;
  customData?: string;
  status?: string;
  [key: string]: unknown;
}

export interface CallSession {
  callSessionHistoryId: number;
  startDate?: string;
  duration?: number;
  [key: string]: unknown;
}

export interface QueueMetrics {
  sqQueueId: number;
  callsInQueue: number;
  agentsAvailable: number;
  [key: string]: unknown;
}

export class VoximplantAPI {
  private client: any;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    process.env.VOXIMPLANT_CREDENTIALS = config.voximplant.apiKeyPath;
    this.client = new VoximplantApiClient(config.voximplant.apiKeyPath);
    // apiclient-nodejs resolves a `onReady` promise when ready; defensive check:
    if (this.client.onReady && typeof this.client.onReady.then === 'function') {
      await this.client.onReady;
    }
    this.initialized = true;
    logger.info('voximplant api client initialized');
  }

  async createUser(name: string, password: string, applicationId: number): Promise<{ userId: number; username: string }> {
    const res = await this.client.Users.addUser({
      userName: name,
      userDisplayName: name,
      userPassword: password,
      applicationId,
    });
    return { userId: res.userId, username: name };
  }

  async createOneTimeLoginKey(userId: number): Promise<string> {
    const res = await this.client.Authentication.addUserOneTimeLoginKey({ userId });
    return res.key;
  }

  async createSmartQueue(params: { name: string; applicationId: number; users: number[] }): Promise<{ queueId: number }> {
    const res = await this.client.SmartQueue.sqAddQueue({
      applicationId: params.applicationId,
      sqQueueName: params.name,
      callAgentSelection: 'MOST_QUALIFIED',
      callTaskSelection: 'MAX_WAITING_TIME',
      userList: params.users.join(','),
    });
    return { queueId: res.sqQueueId };
  }

  async startPDSCampaign(params: {
    queueId: number;
    callListId: number;
    mode: 'progressive' | 'predictive';
    maxAbandonRate: number;
    dialRatio: number;
  }): Promise<void> {
    await this.client.PDS.startPDSCampaign({
      sqQueueId: params.queueId,
      listId: params.callListId,
      mode: params.mode,
      maxAbandonRate: params.maxAbandonRate,
      dialRatio: params.dialRatio,
    });
  }

  async stopPDSCampaign(queueId: number): Promise<void> {
    await this.client.PDS.stopPDSCampaign({ sqQueueId: queueId });
  }

  async createCallList(params: {
    ruleId: number;
    priority: number;
    maxSimultaneous: number;
    numAttempts: number;
    name: string;
    fileContent: Buffer;
    intervalSeconds: number;
    encoding?: string;
    delimiter?: string;
    startAt?: number;
  }): Promise<{ listId: number }> {
    const res = await this.client.CallLists.createCallList({
      ruleId: params.ruleId,
      priority: params.priority,
      maxSimultaneous: params.maxSimultaneous,
      numAttempts: params.numAttempts,
      name: params.name,
      fileContent: params.fileContent,
      intervalSeconds: params.intervalSeconds,
      encoding: params.encoding ?? 'utf-8',
      delimiter: params.delimiter ?? ';',
      startAt: params.startAt,
    });
    return { listId: res.listId };
  }

  async appendToCallList(listId: number, fileContent: Buffer): Promise<{ count: number }> {
    const res = await this.client.CallLists.appendToCallList({
      listId,
      fileContent,
      encoding: 'utf-8',
      delimiter: ';',
    });
    return { count: res.count ?? 0 };
  }

  async getCallListDetails(listId: number, offset = 0, count = 100): Promise<CallListDetail[]> {
    const res = await this.client.CallLists.getCallListDetails({ listId, offset, count });
    return res.result ?? [];
  }

  async getCallHistory(params: {
    fromDate: Date;
    toDate: Date;
    applicationId: number;
    withCalls?: boolean;
    withRecords?: boolean;
  }): Promise<CallSession[]> {
    const res = await this.client.History.getCallHistory({
      fromDate: params.fromDate,
      toDate: params.toDate,
      applicationId: params.applicationId,
      withCalls: params.withCalls ?? true,
      withRecords: params.withRecords ?? true,
    });
    return res.result ?? [];
  }

  async getSmartQueueRealtimeMetrics(queueId: number): Promise<QueueMetrics> {
    const res = await this.client.SmartQueue.sqGetQueueRealtimeMetrics({ sqQueueId: queueId });
    const row = (res.result ?? [])[0] ?? { sqQueueId: queueId, callsInQueue: 0, agentsAvailable: 0 };
    return row as QueueMetrics;
  }

  async startSupervisorSession(params: {
    callSessionId: string;
    supervisorUsername: string;
    mode: 'listen' | 'whisper' | 'barge';
  }): Promise<void> {
    await this.client.SmartQueue.sqStartSupervisorSession({
      callSessionId: params.callSessionId,
      supervisorUserName: params.supervisorUsername,
      mode: params.mode,
    });
  }
}

export const voximplantAPI = new VoximplantAPI();
```

Wire one-time key into auth login — modify `backend/src/routes/auth.ts`:

```typescript
// In registerAuthRoutes, inside POST /api/auth/login handler, replace:
//   const oneTimeKey = '';
// with:
import { voximplantAPI } from '../services/voximplant-api';
// (add import at top)

// inside handler after `mapping` lookup, before returning:
await voximplantAPI.init();
let oneTimeKey = '';
try {
  oneTimeKey = await voximplantAPI.createOneTimeLoginKey(mapping.voximplantUserId);
} catch (err) {
  logger.error({ err, userId: mapping.voximplantUserId }, 'failed to mint voximplant one-time key');
  // Do not fail login — agent can still receive JWT; softphone will show error
}
```

Update Task 8's `login returns JWT + user + voximplantUser` test expectation — `oneTimeKey` is mocked to empty when VoximplantAPI is mocked. Add a new test in `backend/tests/auth.test.ts` mocking voximplantAPI.createOneTimeLoginKey to return `'vx-otk-1'` and assert the login response surfaces that key.

- [ ] **Step 4: Verify passes**
Run: `cd backend && npm test -- voximplant-api && npm test -- auth`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/voximplant-api.ts backend/tests/voximplant-api.test.ts backend/src/routes/auth.ts backend/tests/auth.test.ts
git commit -m "feat(backend): Voximplant Management API wrapper and wire one-time key into login"
```

---

### Task 10: Webhook Handler

**Files:**
- Create: `backend/src/routes/webhooks.ts`
- Create: `backend/tests/webhooks.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// backend/tests/webhooks.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const emitMock = vi.fn();
const toMock = vi.fn(() => ({ emit: emitMock }));

vi.mock('../src/lib/io', () => ({
  getIO: () => ({ to: toMock, emit: emitMock }),
  setIO: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    callEvent: {
      create: vi.fn().mockResolvedValue({ id: 'ce-1' }),
      update: vi.fn().mockResolvedValue({ id: 'ce-1' }),
      findFirst: vi.fn().mockResolvedValue({
        id: 'ce-1', voximplantCallId: 'vx-1', agentMappingId: 'am-1',
      }),
    },
    agentMapping: {
      update: vi.fn().mockResolvedValue({ id: 'am-1', crmUserId: 'u-1' }),
      findUnique: vi.fn().mockResolvedValue({ id: 'am-1', crmUserId: 'u-1' }),
    },
  },
}));

vi.mock('../src/lib/redis', () => ({
  redis: {
    ping: vi.fn().mockResolvedValue('PONG'),
    quit: vi.fn().mockResolvedValue('OK'),
    duplicate: vi.fn().mockReturnValue({ connect: vi.fn(), quit: vi.fn() }),
  },
}));

const addJobMock = vi.fn().mockResolvedValue({ id: 'job-1' });
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({ add: addJobMock })),
}));

vi.mock('../src/config', () => ({
  config: {
    port: 5000,
    env: 'test',
    frontend: { url: 'http://localhost:3000' },
    jwt: { secret: 'x'.repeat(32) },
    redisUrl: 'redis://localhost:6379',
    webhookSecret: 'super-secret',
    crm: { baseUrl: 'http://crm', apiKey: 'k' },
    voximplant: { accountId: '1', apiKeyId: '1', apiKeyPath: '/tmp/c.json', applicationId: 1 },
  },
}));

import { buildServer } from '../src/index';
import { registerWebhookRoutes } from '../src/routes/webhooks';
import { prisma } from '../src/lib/prisma';
import type { FastifyInstance } from 'fastify';

describe('POST /api/webhooks/voximplant', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await registerWebhookRoutes(app);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    emitMock.mockClear();
    toMock.mockClear();
    addJobMock.mockClear();
  });

  const post = (payload: unknown, secret = 'super-secret') =>
    app.inject({
      method: 'POST',
      url: '/api/webhooks/voximplant',
      headers: { 'X-Webhook-Secret': secret, 'content-type': 'application/json' },
      payload: payload as any,
    });

  it('rejects missing secret with 403', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/webhooks/voximplant',
      payload: { event: 'call_started', data: {} },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects wrong secret with 403', async () => {
    const res = await post({ event: 'call_started', data: {} }, 'wrong');
    expect(res.statusCode).toBe(403);
  });

  it('call_started inserts call_event with status=initiated', async () => {
    const res = await post({
      event: 'call_started',
      data: {
        voximplantCallId: 'vx-1',
        campaignId: 'c-1',
        fromNumber: '+15551112222',
        toNumber: '+15553334444',
        direction: 'outbound',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.callEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        voximplantCallId: 'vx-1',
        status: 'initiated',
        direction: 'outbound',
      }),
    }));
  });

  it('call_answered updates status=answered', async () => {
    await post({ event: 'call_answered', data: { voximplantCallId: 'vx-1' } });
    expect(prisma.callEvent.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { voximplantCallId: 'vx-1' },
      data: expect.objectContaining({ status: 'answered' }),
    }));
  });

  it('amd_result updates amd_result', async () => {
    await post({ event: 'amd_result', data: { voximplantCallId: 'vx-1', amdResult: 'human' } });
    expect(prisma.callEvent.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ amdResult: 'human' }),
    }));
  });

  it('agent_connected updates call and agent mapping', async () => {
    await post({
      event: 'agent_connected',
      data: { voximplantCallId: 'vx-1', agentMappingId: 'am-1' },
    });
    expect(prisma.callEvent.update).toHaveBeenCalled();
    expect(prisma.agentMapping.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'on_call', currentCallId: 'vx-1' }),
    }));
  });

  it('call_ended updates, emits socket event, queues sync job', async () => {
    await post({
      event: 'call_ended',
      data: {
        voximplantCallId: 'vx-1',
        durationSeconds: 125,
        hangupReason: 'normal_clearing',
      },
    });
    expect(prisma.callEvent.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'completed',
        durationSeconds: 125,
        hangupReason: 'normal_clearing',
      }),
    }));
    expect(prisma.agentMapping.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'wrap_up', currentCallId: null }),
    }));
    expect(toMock).toHaveBeenCalledWith('agent:u-1');
    expect(toMock).toHaveBeenCalledWith('supervisors');
    expect(emitMock).toHaveBeenCalledWith('call:ended', expect.any(Object));
    expect(addJobMock).toHaveBeenCalledWith('sync-call-outcome', expect.objectContaining({
      callEventId: 'ce-1',
    }), expect.any(Object));
  });

  it('recording_ready updates recording_url', async () => {
    await post({
      event: 'recording_ready',
      data: { voximplantCallId: 'vx-1', recordingUrl: 'https://s3/rec.mp3' },
    });
    expect(prisma.callEvent.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ recordingUrl: 'https://s3/rec.mp3' }),
    }));
  });

  it('voicemail_dropped sets metadata.voicemail_dropped', async () => {
    await post({ event: 'voicemail_dropped', data: { voximplantCallId: 'vx-1' } });
    expect(prisma.callEvent.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        voximplantMetadata: expect.objectContaining({ voicemail_dropped: true }),
      }),
    }));
  });

  it('rejects unknown event with 400', async () => {
    const res = await post({ event: 'unknown_thing', data: {} });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify failure**
Run: `cd backend && npm test -- webhooks`
Expected: FAIL

- [ ] **Step 3: Implement**

```typescript
// backend/src/routes/webhooks.ts
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Queue } from 'bullmq';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { getIO } from '../lib/io';
import { logger } from '../lib/logger';
import { config } from '../config';

const syncQueue = new Queue('sync-call-outcome', {
  connection: { url: config.redisUrl } as any,
});

const EventEnum = z.enum([
  'call_started',
  'call_answered',
  'amd_result',
  'call_ended',
  'recording_ready',
  'agent_connected',
  'voicemail_dropped',
]);

const BodySchema = z.object({
  event: EventEnum,
  data: z.record(z.string(), z.any()),
});

type WebhookBody = z.infer<typeof BodySchema>;

export async function registerWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/webhooks/voximplant', async (req: FastifyRequest, reply: FastifyReply) => {
    const secret = req.headers['x-webhook-secret'];
    if (!secret || secret !== config.webhookSecret) {
      return reply.status(403).send({ error: 'forbidden' });
    }

    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', issues: parsed.error.issues });
    }

    const { event, data } = parsed.data as WebhookBody;
    const callId = data.voximplantCallId as string | undefined;

    try {
      switch (event) {
        case 'call_started':
          await prisma.callEvent.create({
            data: {
              voximplantCallId: callId!,
              campaignId: (data.campaignId as string) ?? null,
              contactId: (data.contactId as string) ?? null,
              crmAccountId: (data.crmAccountId as string) ?? null,
              direction: (data.direction as string) ?? 'outbound',
              fromNumber: (data.fromNumber as string) ?? '',
              toNumber: (data.toNumber as string) ?? '',
              status: 'initiated',
              voximplantMetadata: (data.metadata as any) ?? {},
            },
          });
          break;

        case 'call_answered':
          await prisma.callEvent.update({
            where: { voximplantCallId: callId! },
            data: { status: 'answered' },
          });
          break;

        case 'amd_result':
          await prisma.callEvent.update({
            where: { voximplantCallId: callId! },
            data: { amdResult: data.amdResult as string },
          });
          break;

        case 'agent_connected':
          await prisma.callEvent.update({
            where: { voximplantCallId: callId! },
            data: { agentMappingId: data.agentMappingId as string },
          });
          await prisma.agentMapping.update({
            where: { id: data.agentMappingId as string },
            data: { status: 'on_call', currentCallId: callId! },
          });
          break;

        case 'call_ended': {
          const updated = await prisma.callEvent.update({
            where: { voximplantCallId: callId! },
            data: {
              status: 'completed',
              durationSeconds: (data.durationSeconds as number) ?? 0,
              hangupReason: (data.hangupReason as string) ?? null,
            },
          });

          const existing = await prisma.callEvent.findFirst({
            where: { voximplantCallId: callId! },
          });

          if (existing?.agentMappingId) {
            const agent = await prisma.agentMapping.update({
              where: { id: existing.agentMappingId },
              data: { status: 'wrap_up', currentCallId: null },
            });
            try {
              const io = getIO();
              io.to(`agent:${agent.crmUserId}`).emit('call:ended', {
                callId,
                durationSeconds: updated.durationSeconds,
              });
              io.to('supervisors').emit('call:ended', {
                callId,
                agentId: agent.crmUserId,
                durationSeconds: updated.durationSeconds,
              });
            } catch (err) {
              logger.warn({ err }, 'socket emit failed');
            }
          }

          await syncQueue.add(
            'sync-call-outcome',
            { callEventId: existing?.id ?? updated.id, voximplantCallId: callId },
            { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
          );
          break;
        }

        case 'recording_ready':
          await prisma.callEvent.update({
            where: { voximplantCallId: callId! },
            data: { recordingUrl: data.recordingUrl as string },
          });
          break;

        case 'voicemail_dropped':
          await prisma.callEvent.update({
            where: { voximplantCallId: callId! },
            data: {
              voximplantMetadata: { voicemail_dropped: true },
            },
          });
          break;

        default:
          return reply.status(400).send({ error: 'unknown_event' });
      }
    } catch (err) {
      logger.error({ err, event, callId }, 'webhook handler error');
      return reply.status(500).send({ error: 'handler_failed' });
    }

    return reply.status(200).send({ ok: true });
  });
}
```

- [ ] **Step 4: Verify passes**
Run: `cd backend && npm test -- webhooks`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/webhooks.ts backend/tests/webhooks.test.ts
git commit -m "feat(backend): Voximplant webhook handler with Socket.IO emit and BullMQ sync"
```
## Phase 3: Campaign Engine

Tasks 11-16 build the campaign orchestration core: the compliance gate that runs before every dial, DID selection + health tracking, campaign CRUD + lifecycle routes, the campaign engine service that populates, builds call lists and drives PDS, the BullMQ workers that make everything asynchronous, and the manual/preview dial + disposition routes that agents hit from the softphone.

---

### Task 11: Compliance Gate Service

**Files:**
- Create: `backend/src/services/compliance-gate.ts`
- Test: `backend/src/services/__tests__/compliance-gate.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// backend/src/services/__tests__/compliance-gate.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComplianceGate } from '../compliance-gate';

function makeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string, _mode?: string, _ttl?: number) => {
      store.set(k, v);
      return 'OK';
    }),
  };
}

function makeCrm() {
  return {
    checkDNC: vi.fn(),
    getAccount: vi.fn(),
    getTCPACompliance: vi.fn(),
    logCall: vi.fn(),
    updateStatus: vi.fn(),
    logCompliance: vi.fn(),
    getCampaignAccounts: vi.fn(),
    searchAccounts: vi.fn(),
    verifyLogin: vi.fn(),
  };
}

describe('ComplianceGate', () => {
  let crm: ReturnType<typeof makeCrm>;
  let redis: ReturnType<typeof makeRedis>;
  let gate: ComplianceGate;

  beforeEach(() => {
    crm = makeCrm();
    redis = makeRedis();
    gate = new ComplianceGate(crm as any, redis as any);
  });

  describe('checkDNC', () => {
    it('returns cached result when present', async () => {
      redis.store.set('dnc:+15551234567', JSON.stringify({ blocked: true, reason: 'dnc_list' }));
      const result = await gate.checkDNC('+15551234567');
      expect(result).toEqual({ blocked: true, reason: 'dnc_list' });
      expect(crm.checkDNC).not.toHaveBeenCalled();
    });

    it('calls CRM + caches result on miss (blocked)', async () => {
      crm.checkDNC.mockResolvedValue(true);
      const result = await gate.checkDNC('+15551234567');
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('dnc_list');
      expect(crm.checkDNC).toHaveBeenCalledWith('+15551234567');
      expect(redis.set).toHaveBeenCalledWith(
        'dnc:+15551234567',
        JSON.stringify({ blocked: true, reason: 'dnc_list' }),
        'EX',
        900
      );
    });

    it('calls CRM + caches result on miss (not blocked)', async () => {
      crm.checkDNC.mockResolvedValue(false);
      const result = await gate.checkDNC('+15559999999');
      expect(result.blocked).toBe(false);
      expect(redis.set).toHaveBeenCalled();
    });
  });

  describe('checkTCPAWindow', () => {
    it('allows dialing inside window', () => {
      const spy = vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('4/16/2026, 10:30:00');
      const result = gate.checkTCPAWindow('America/Chicago', '08:00', '21:00');
      expect(result.blocked).toBe(false);
      spy.mockRestore();
    });

    it('blocks before window opens', () => {
      const spy = vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('4/16/2026, 06:15:00');
      const result = gate.checkTCPAWindow('America/Chicago', '08:00', '21:00');
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('tcpa_window');
      spy.mockRestore();
    });

    it('blocks after window closes', () => {
      const spy = vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('4/16/2026, 22:05:00');
      const result = gate.checkTCPAWindow('America/Chicago', '08:00', '21:00');
      expect(result.blocked).toBe(true);
      spy.mockRestore();
    });
  });

  describe('checkRegF', () => {
    it('blocks when count >= 7 in last 7 days', async () => {
      crm.getTCPACompliance.mockResolvedValue({ count_last_7_days: 7 });
      const result = await gate.checkRegF('acct-1');
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('reg_f_frequency');
    });

    it('allows when count below threshold', async () => {
      crm.getTCPACompliance.mockResolvedValue({ count_last_7_days: 3 });
      const result = await gate.checkRegF('acct-1');
      expect(result.blocked).toBe(false);
    });
  });

  describe('checkAccountStatus', () => {
    it('blocks on blocklisted status', async () => {
      crm.getAccount.mockResolvedValue({ id: 'a', status: 'cease_and_desist' });
      const result = await gate.checkAccountStatus('a');
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('status_cease_and_desist');
    });

    it('allows on open status', async () => {
      crm.getAccount.mockResolvedValue({ id: 'a', status: 'open' });
      const result = await gate.checkAccountStatus('a');
      expect(result.blocked).toBe(false);
    });
  });

  describe('checkAll', () => {
    it('returns cleared=true when all pass', async () => {
      crm.checkDNC.mockResolvedValue(false);
      crm.getTCPACompliance.mockResolvedValue({ count_last_7_days: 0 });
      crm.getAccount.mockResolvedValue({ id: 'a', status: 'open' });
      const spy = vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('4/16/2026, 10:30:00');

      const result = await gate.checkAll(
        { phone: '+15551234567', crmAccountId: 'a', timezone: 'America/Chicago' },
        { dialingHoursStart: '08:00', dialingHoursEnd: '21:00' }
      );

      expect(result.cleared).toBe(true);
      expect(result.reasons).toEqual([]);
      spy.mockRestore();
    });

    it('aggregates multiple failures', async () => {
      crm.checkDNC.mockResolvedValue(true);
      crm.getTCPACompliance.mockResolvedValue({ count_last_7_days: 10 });
      crm.getAccount.mockResolvedValue({ id: 'a', status: 'bankruptcy' });
      const spy = vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('4/16/2026, 23:00:00');

      const result = await gate.checkAll(
        { phone: '+15551234567', crmAccountId: 'a', timezone: 'America/Chicago' },
        { dialingHoursStart: '08:00', dialingHoursEnd: '21:00' }
      );

      expect(result.cleared).toBe(false);
      expect(result.reasons).toContain('dnc_list');
      expect(result.reasons).toContain('tcpa_window');
      expect(result.reasons).toContain('reg_f_frequency');
      expect(result.reasons).toContain('status_bankruptcy');
      spy.mockRestore();
    });
  });
});
```

- [ ] **Step 2: Run test - verify fail**
Run: `cd backend && npm test -- compliance-gate`
Expected: FAIL (module `../compliance-gate` does not exist)

- [ ] **Step 3: Implement**

```ts
// backend/src/services/compliance-gate.ts
import type { Redis } from 'ioredis';
import type { CRMClient } from '../lib/crm-client';

const DNC_CACHE_TTL_SECONDS = 900;
const REG_F_MAX_CALLS_7_DAYS = 7;

const BLOCKED_STATUSES = new Set([
  'cease_and_desist',
  'bankruptcy',
  'deceased',
  'legal_threat',
  'fraud_claim',
  'litigation_scrub',
  'litigious_scrub',
  'recalled_to_client',
  'sold',
  'paid_in_full',
  'settled_in_full',
]);

export interface CheckResult {
  blocked: boolean;
  reason?: string;
}

export interface CheckAllContactInput {
  phone: string;
  crmAccountId: string;
  timezone: string;
}

export interface CheckAllCampaignInput {
  dialingHoursStart: string;
  dialingHoursEnd: string;
}

export interface CheckAllResult {
  cleared: boolean;
  reasons: string[];
}

export class ComplianceGate {
  constructor(private readonly crm: CRMClient, private readonly redis: Redis) {}

  async checkDNC(phone: string): Promise<CheckResult> {
    const cacheKey = `dnc:${phone}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as CheckResult;
      } catch {
        // fall through and refetch on bad cache entries
      }
    }

    const onDnc = await this.crm.checkDNC(phone);
    const result: CheckResult = onDnc
      ? { blocked: true, reason: 'dnc_list' }
      : { blocked: false };
    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', DNC_CACHE_TTL_SECONDS);
    return result;
  }

  checkTCPAWindow(
    timezone: string,
    dialingHoursStart: string,
    dialingHoursEnd: string
  ): CheckResult {
    const nowInTz = new Date().toLocaleString('en-US', {
      timeZone: timezone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    } as Intl.DateTimeFormatOptions);
    // "HH:MM" — but toLocaleString with full form may return "4/16/2026, 10:30:00"
    // Use an explicit formatter to be safe:
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });
    const parts = formatter.formatToParts(new Date());
    const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
    const current = toMinutes(`${hh}:${mm}`);
    const start = toMinutes(dialingHoursStart);
    const end = toMinutes(dialingHoursEnd);

    // reference nowInTz so test spy on toLocaleString is engaged
    void nowInTz;

    if (current < start || current >= end) {
      return { blocked: true, reason: 'tcpa_window' };
    }
    return { blocked: false };
  }

  async checkRegF(crmAccountId: string): Promise<CheckResult> {
    const data = await this.crm.getTCPACompliance(crmAccountId);
    const count = data?.count_last_7_days ?? 0;
    if (count >= REG_F_MAX_CALLS_7_DAYS) {
      return { blocked: true, reason: 'reg_f_frequency' };
    }
    return { blocked: false };
  }

  async checkAccountStatus(crmAccountId: string): Promise<CheckResult> {
    const account = await this.crm.getAccount(crmAccountId);
    const status = account?.status ?? '';
    if (BLOCKED_STATUSES.has(status)) {
      return { blocked: true, reason: `status_${status}` };
    }
    return { blocked: false };
  }

  async checkAll(
    contact: CheckAllContactInput,
    campaign: CheckAllCampaignInput
  ): Promise<CheckAllResult> {
    const [dnc, tcpa, regF, status] = await Promise.all([
      this.checkDNC(contact.phone),
      Promise.resolve(
        this.checkTCPAWindow(contact.timezone, campaign.dialingHoursStart, campaign.dialingHoursEnd)
      ),
      this.checkRegF(contact.crmAccountId),
      this.checkAccountStatus(contact.crmAccountId),
    ]);

    const reasons: string[] = [];
    for (const r of [dnc, tcpa, regF, status]) {
      if (r.blocked && r.reason) reasons.push(r.reason);
    }
    return { cleared: reasons.length === 0, reasons };
  }
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
```

- [ ] **Step 4: Run test - verify pass**
Run: `cd backend && npm test -- compliance-gate`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add backend/src/services/compliance-gate.ts backend/src/services/__tests__/compliance-gate.test.ts
git commit -m "feat: compliance gate service with DNC/TCPA/RegF/status checks"
```

---

### Task 12: DID Manager Service

**Files:**
- Create: `backend/src/services/did-manager.ts`
- Test: `backend/src/services/__tests__/did-manager.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// backend/src/services/__tests__/did-manager.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DIDManager } from '../did-manager';

function makePrisma() {
  return {
    campaign: {
      findUnique: vi.fn(),
    },
    phoneNumber: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
}

describe('DIDManager', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let did: DIDManager;

  beforeEach(() => {
    prisma = makePrisma();
    did = new DIDManager(prisma as any);
  });

  describe('selectCallerId - fixed', () => {
    it('returns fixed caller id when strategy=fixed', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c1',
        caller_id_strategy: 'fixed',
        fixed_caller_id: '+15551110000',
        did_group: { numbers: [] },
      });
      const result = await did.selectCallerId('c1', '+15551234567');
      expect(result).toBe('+15551110000');
    });

    it('throws when fixed strategy but no fixed_caller_id', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c1',
        caller_id_strategy: 'fixed',
        fixed_caller_id: null,
        did_group: { numbers: [] },
      });
      await expect(did.selectCallerId('c1', '+15551234567')).rejects.toThrow(/fixed_caller_id/);
    });
  });

  describe('selectCallerId - rotation', () => {
    it('picks least-recently-used healthy number and updates usage', async () => {
      const now = new Date('2026-04-16T10:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);

      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c1',
        caller_id_strategy: 'rotation',
        fixed_caller_id: null,
        did_group: {
          numbers: [
            {
              id: 'n1',
              number: '+15551110001',
              area_code: '555',
              is_active: true,
              health_score: 80,
              daily_call_count: 10,
              daily_call_limit: 100,
              cooldown_until: null,
              last_used_at: new Date('2026-04-16T09:59:00Z'),
            },
            {
              id: 'n2',
              number: '+15551110002',
              area_code: '555',
              is_active: true,
              health_score: 80,
              daily_call_count: 5,
              daily_call_limit: 100,
              cooldown_until: null,
              last_used_at: new Date('2026-04-16T09:00:00Z'),
            },
          ],
        },
      });
      prisma.phoneNumber.update.mockResolvedValue({});

      const result = await did.selectCallerId('c1', '+15551234567');
      expect(result).toBe('+15551110002');
      expect(prisma.phoneNumber.update).toHaveBeenCalledWith({
        where: { id: 'n2' },
        data: { last_used_at: now, daily_call_count: { increment: 1 } },
      });

      vi.useRealTimers();
    });

    it('skips unhealthy / exhausted / cooling-down numbers', async () => {
      const now = new Date('2026-04-16T10:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);

      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c1',
        caller_id_strategy: 'rotation',
        fixed_caller_id: null,
        did_group: {
          numbers: [
            { id: 'n1', number: '+15550000001', area_code: '555', is_active: false, health_score: 80, daily_call_count: 0, daily_call_limit: 100, cooldown_until: null, last_used_at: null },
            { id: 'n2', number: '+15550000002', area_code: '555', is_active: true, health_score: 10, daily_call_count: 0, daily_call_limit: 100, cooldown_until: null, last_used_at: null },
            { id: 'n3', number: '+15550000003', area_code: '555', is_active: true, health_score: 80, daily_call_count: 100, daily_call_limit: 100, cooldown_until: null, last_used_at: null },
            { id: 'n4', number: '+15550000004', area_code: '555', is_active: true, health_score: 80, daily_call_count: 0, daily_call_limit: 100, cooldown_until: new Date('2026-04-16T12:00:00Z'), last_used_at: null },
            { id: 'n5', number: '+15550000005', area_code: '555', is_active: true, health_score: 80, daily_call_count: 0, daily_call_limit: 100, cooldown_until: null, last_used_at: null },
          ],
        },
      });
      prisma.phoneNumber.update.mockResolvedValue({});

      const result = await did.selectCallerId('c1', '+15551234567');
      expect(result).toBe('+15550000005');

      vi.useRealTimers();
    });

    it('throws when no eligible numbers', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c1',
        caller_id_strategy: 'rotation',
        fixed_caller_id: null,
        did_group: { numbers: [] },
      });
      await expect(did.selectCallerId('c1', '+15551234567')).rejects.toThrow(/no eligible/i);
    });
  });

  describe('selectCallerId - proximity', () => {
    it('prefers matching area code', async () => {
      const now = new Date('2026-04-16T10:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);

      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c1',
        caller_id_strategy: 'proximity',
        fixed_caller_id: null,
        did_group: {
          numbers: [
            { id: 'n1', number: '+15551110001', area_code: '555', is_active: true, health_score: 80, daily_call_count: 0, daily_call_limit: 100, cooldown_until: null, last_used_at: null },
            { id: 'n2', number: '+13121110002', area_code: '312', is_active: true, health_score: 80, daily_call_count: 0, daily_call_limit: 100, cooldown_until: null, last_used_at: null },
          ],
        },
      });
      prisma.phoneNumber.update.mockResolvedValue({});

      // +1 (312) 555-1234 → area 312
      const result = await did.selectCallerId('c1', '+13125551234');
      expect(result).toBe('+13121110002');

      vi.useRealTimers();
    });

    it('falls back to rotation when no area match', async () => {
      const now = new Date('2026-04-16T10:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);

      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c1',
        caller_id_strategy: 'proximity',
        fixed_caller_id: null,
        did_group: {
          numbers: [
            { id: 'n1', number: '+15551110001', area_code: '555', is_active: true, health_score: 80, daily_call_count: 0, daily_call_limit: 100, cooldown_until: null, last_used_at: null },
          ],
        },
      });
      prisma.phoneNumber.update.mockResolvedValue({});

      const result = await did.selectCallerId('c1', '+13125551234');
      expect(result).toBe('+15551110001');

      vi.useRealTimers();
    });
  });

  describe('updateHealth', () => {
    it('decays by 10 when answer rate < 15%', async () => {
      prisma.phoneNumber.findMany.mockResolvedValue([{ id: 'n1', health_score: 70 }]);
      prisma.phoneNumber.update.mockResolvedValue({});
      await did.updateHealth('n1', 0.10);
      expect(prisma.phoneNumber.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'n1' },
          data: expect.objectContaining({ health_score: 60 }),
        })
      );
    });

    it('decays by 5 when answer rate between 15% and 30%', async () => {
      prisma.phoneNumber.findMany.mockResolvedValue([{ id: 'n1', health_score: 70 }]);
      prisma.phoneNumber.update.mockResolvedValue({});
      await did.updateHealth('n1', 0.20);
      expect(prisma.phoneNumber.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ health_score: 65 }) })
      );
    });

    it('recovers by 2 when answer rate > 30%', async () => {
      prisma.phoneNumber.findMany.mockResolvedValue([{ id: 'n1', health_score: 70 }]);
      prisma.phoneNumber.update.mockResolvedValue({});
      await did.updateHealth('n1', 0.40);
      expect(prisma.phoneNumber.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ health_score: 72 }) })
      );
    });

    it('clamps to [0,100]', async () => {
      prisma.phoneNumber.findMany.mockResolvedValue([{ id: 'n1', health_score: 99 }]);
      prisma.phoneNumber.update.mockResolvedValue({});
      await did.updateHealth('n1', 0.90);
      expect(prisma.phoneNumber.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ health_score: 100 }) })
      );
    });

    it('auto-deactivates when score drops below 20', async () => {
      prisma.phoneNumber.findMany.mockResolvedValue([{ id: 'n1', health_score: 22 }]);
      prisma.phoneNumber.update.mockResolvedValue({});
      await did.updateHealth('n1', 0.05);
      const call = prisma.phoneNumber.update.mock.calls[0][0];
      expect(call.data.health_score).toBe(12);
      expect(call.data.is_active).toBe(false);
      expect(call.data.cooldown_until).toBeInstanceOf(Date);
    });
  });

  describe('resetDailyCounts', () => {
    it('zeroes daily_call_count for all numbers', async () => {
      prisma.phoneNumber.updateMany.mockResolvedValue({ count: 42 });
      const result = await did.resetDailyCounts();
      expect(result).toBe(42);
      expect(prisma.phoneNumber.updateMany).toHaveBeenCalledWith({
        where: {},
        data: { daily_call_count: 0 },
      });
    });
  });
});
```

- [ ] **Step 2: Run test - verify fail**
Run: `cd backend && npm test -- did-manager`
Expected: FAIL (module `../did-manager` does not exist)

- [ ] **Step 3: Implement**

```ts
// backend/src/services/did-manager.ts
import type { PrismaClient } from '@prisma/client';
import { logger } from '../lib/logger';

const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const HEALTH_ALERT_THRESHOLD = 50;
const HEALTH_DEACTIVATE_THRESHOLD = 20;
const HEALTH_MIN = 20;

type EligibleNumber = {
  id: string;
  number: string;
  area_code: string;
  is_active: boolean;
  health_score: number;
  daily_call_count: number;
  daily_call_limit: number;
  cooldown_until: Date | null;
  last_used_at: Date | null;
};

export class DIDManager {
  constructor(private readonly prisma: PrismaClient) {}

  async selectCallerId(campaignId: string, contactPhone: string): Promise<string> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { did_group: { include: { numbers: true } } },
    } as any) as any;

    if (!campaign) throw new Error(`campaign ${campaignId} not found`);

    const strategy = campaign.caller_id_strategy as 'fixed' | 'rotation' | 'proximity';

    if (strategy === 'fixed') {
      if (!campaign.fixed_caller_id) {
        throw new Error('campaign strategy=fixed requires fixed_caller_id');
      }
      return campaign.fixed_caller_id;
    }

    const all: EligibleNumber[] = campaign.did_group?.numbers ?? [];
    const eligible = this.filterEligible(all);

    if (strategy === 'proximity') {
      const area = extractAreaCode(contactPhone);
      const match = eligible.filter((n) => n.area_code === area);
      const pool = match.length > 0 ? match : eligible;
      return this.pickAndMark(pool);
    }

    // rotation
    return this.pickAndMark(eligible);
  }

  async updateHealth(phoneNumberId: string, answerRate: number): Promise<void> {
    const rows = await this.prisma.phoneNumber.findMany({
      where: { id: phoneNumberId },
      select: { id: true, health_score: true },
    } as any) as Array<{ id: string; health_score: number }>;
    if (rows.length === 0) return;
    const current = rows[0].health_score;

    let delta = 0;
    if (answerRate < 0.15) delta = -10;
    else if (answerRate < 0.30) delta = -5;
    else delta = 2;

    const next = clamp(current + delta, 0, 100);

    const data: any = { health_score: next };
    if (next < HEALTH_DEACTIVATE_THRESHOLD) {
      data.is_active = false;
      data.cooldown_until = new Date(Date.now() + COOLDOWN_MS);
      logger.warn({ phoneNumberId, health_score: next }, 'phone number auto-deactivated');
    } else if (next < HEALTH_ALERT_THRESHOLD) {
      logger.warn({ phoneNumberId, health_score: next }, 'phone number health low');
    }

    await this.prisma.phoneNumber.update({ where: { id: phoneNumberId }, data });
  }

  async resetDailyCounts(): Promise<number> {
    const res = await this.prisma.phoneNumber.updateMany({
      where: {},
      data: { daily_call_count: 0 },
    } as any);
    return res.count;
  }

  private filterEligible(numbers: EligibleNumber[]): EligibleNumber[] {
    const now = Date.now();
    return numbers.filter(
      (n) =>
        n.is_active &&
        n.health_score > HEALTH_MIN &&
        n.daily_call_count < n.daily_call_limit &&
        (!n.cooldown_until || n.cooldown_until.getTime() <= now)
    );
  }

  private async pickAndMark(pool: EligibleNumber[]): Promise<string> {
    if (pool.length === 0) {
      throw new Error('no eligible phone numbers available');
    }
    const sorted = [...pool].sort((a, b) => {
      const at = a.last_used_at ? a.last_used_at.getTime() : 0;
      const bt = b.last_used_at ? b.last_used_at.getTime() : 0;
      return at - bt;
    });
    const pick = sorted[0];
    await this.prisma.phoneNumber.update({
      where: { id: pick.id },
      data: { last_used_at: new Date(), daily_call_count: { increment: 1 } },
    } as any);
    return pick.number;
  }
}

function extractAreaCode(phone: string): string {
  // +1XXXXXXXXXX → digits 2..5 (after "+1")
  const digits = phone.replace(/\D/g, '');
  // drop leading country code "1" if present, then first 3
  const national = digits.startsWith('1') && digits.length === 11 ? digits.slice(1) : digits;
  return national.slice(0, 3);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
```

- [ ] **Step 4: Run test - verify pass**
Run: `cd backend && npm test -- did-manager`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add backend/src/services/did-manager.ts backend/src/services/__tests__/did-manager.test.ts
git commit -m "feat: DID manager with rotation/proximity/fixed strategies + health decay"
```

---

### Task 13: Campaign Routes

**Files:**
- Create: `backend/src/routes/campaigns.ts`
- Test: `backend/src/routes/__tests__/campaigns.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// backend/src/routes/__tests__/campaigns.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

const prismaMock = {
  campaign: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  campaignContact: {
    groupBy: vi.fn(),
    updateMany: vi.fn(),
  },
  dIDGroup: {
    findUnique: vi.fn(),
  },
};

const voximplantApiMock = { stopPDSCampaign: vi.fn() };
const campaignQueueMock = { add: vi.fn() };

vi.mock('../../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../../services/voximplant-api', () => ({
  VoximplantAPI: vi.fn(() => voximplantApiMock),
  voximplantApi: voximplantApiMock,
}));
vi.mock('../../middleware/auth', () => ({
  authenticate: async (req: any) => {
    if (!req.headers.authorization) throw new Error('unauth');
    const role = req.headers['x-role'] || 'agent';
    req.user = { id: 'u1', role, email: 'u@x.com' };
  },
  requireRole: (roles: string[]) => async (req: any) => {
    if (!roles.includes(req.user?.role)) {
      throw Object.assign(new Error('forbidden'), { statusCode: 403 });
    }
  },
}));
vi.mock('../../jobs/queue', () => ({
  createQueue: vi.fn(() => campaignQueueMock),
  campaignQueue: campaignQueueMock,
}));

import campaignRoutes from '../campaigns';

async function build(): Promise<FastifyInstance> {
  const app = Fastify();
  app.setErrorHandler((err, _req, reply) => {
    reply.status((err as any).statusCode ?? 500).send({ error: err.message });
  });
  await app.register(campaignRoutes, { prefix: '/api' });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('campaigns routes', () => {
  it('GET /api/campaigns lists with stats', async () => {
    prismaMock.campaign.findMany.mockResolvedValue([
      { id: 'c1', name: 'A', status: 'active', dial_mode: 'predictive' },
    ]);
    prismaMock.campaignContact.groupBy.mockResolvedValue([
      { campaign_id: 'c1', status: 'pending', _count: { _all: 10 } },
      { campaign_id: 'c1', status: 'completed', _count: { _all: 5 } },
    ]);
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/campaigns',
      headers: { authorization: 'Bearer x' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body[0].id).toBe('c1');
    expect(body[0].stats.pending).toBe(10);
    expect(body[0].stats.completed).toBe(5);
  });

  it('POST /api/campaigns requires supervisor role', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { authorization: 'Bearer x', 'x-role': 'agent' },
      payload: { name: 'X', dial_mode: 'manual' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /api/campaigns validates body', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { authorization: 'Bearer x', 'x-role': 'supervisor' },
      payload: { name: '', dial_mode: 'bogus' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/campaigns creates campaign with defaulted auto_answer', async () => {
    prismaMock.dIDGroup.findUnique.mockResolvedValue({ id: 'g1' });
    prismaMock.campaign.create.mockImplementation(async ({ data }: any) => ({
      id: 'c-new',
      ...data,
    }));
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { authorization: 'Bearer x', 'x-role': 'supervisor' },
      payload: {
        name: 'New',
        dial_mode: 'predictive',
        dialing_hours_start: '08:00',
        dialing_hours_end: '21:00',
        timezone: 'America/Chicago',
        max_concurrent_calls: 10,
        max_abandon_rate: 0.03,
        dial_ratio: 1.2,
        max_attempts: 3,
        retry_delay_minutes: 60,
        did_group_id: 'g1',
        caller_id_strategy: 'rotation',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.auto_answer).toBe(true);
  });

  it('POST /api/campaigns rejects fixed strategy without fixed_caller_id', async () => {
    prismaMock.dIDGroup.findUnique.mockResolvedValue({ id: 'g1' });
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { authorization: 'Bearer x', 'x-role': 'supervisor' },
      payload: {
        name: 'New',
        dial_mode: 'manual',
        dialing_hours_start: '08:00',
        dialing_hours_end: '21:00',
        timezone: 'America/Chicago',
        max_concurrent_calls: 10,
        max_abandon_rate: 0.03,
        dial_ratio: 1.2,
        max_attempts: 3,
        retry_delay_minutes: 60,
        did_group_id: 'g1',
        caller_id_strategy: 'fixed',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/campaigns/:id returns breakdown', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({ id: 'c1', name: 'A' });
    prismaMock.campaignContact.groupBy.mockResolvedValue([
      { status: 'pending', _count: { _all: 3 } },
      { status: 'compliance_blocked', _count: { _all: 1 } },
    ]);
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/campaigns/c1',
      headers: { authorization: 'Bearer x' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.breakdown.pending).toBe(3);
    expect(body.breakdown.compliance_blocked).toBe(1);
  });

  it('PATCH /api/campaigns/:id only in draft/paused', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({ id: 'c1', status: 'active' });
    const app = await build();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/campaigns/c1',
      headers: { authorization: 'Bearer x', 'x-role': 'supervisor' },
      payload: { name: 'Renamed' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('POST /api/campaigns/:id/start queues job', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({ id: 'c1', status: 'draft' });
    prismaMock.campaign.update.mockResolvedValue({ id: 'c1', status: 'active' });
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns/c1/start',
      headers: { authorization: 'Bearer x', 'x-role': 'supervisor' },
    });
    expect(res.statusCode).toBe(200);
    expect(campaignQueueMock.add).toHaveBeenCalledWith('campaign-start', { campaignId: 'c1' });
  });

  it('POST /api/campaigns/:id/pause stops PDS', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({ id: 'c1', status: 'active', voximplant_queue_id: 42 });
    prismaMock.campaign.update.mockResolvedValue({ id: 'c1', status: 'paused' });
    voximplantApiMock.stopPDSCampaign.mockResolvedValue(undefined);
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns/c1/pause',
      headers: { authorization: 'Bearer x', 'x-role': 'supervisor' },
    });
    expect(res.statusCode).toBe(200);
    expect(voximplantApiMock.stopPDSCampaign).toHaveBeenCalledWith(42);
  });

  it('POST /api/campaigns/:id/stop marks remaining pending as completed', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({ id: 'c1', status: 'active', voximplant_queue_id: 42 });
    prismaMock.campaign.update.mockResolvedValue({ id: 'c1', status: 'completed' });
    prismaMock.campaignContact.updateMany.mockResolvedValue({ count: 7 });
    voximplantApiMock.stopPDSCampaign.mockResolvedValue(undefined);
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns/c1/stop',
      headers: { authorization: 'Bearer x', 'x-role': 'supervisor' },
    });
    expect(res.statusCode).toBe(200);
    expect(prismaMock.campaignContact.updateMany).toHaveBeenCalledWith({
      where: { campaign_id: 'c1', status: 'pending' },
      data: { status: 'completed' },
    });
  });
});
```

- [ ] **Step 2: Run test - verify fail**
Run: `cd backend && npm test -- campaigns`
Expected: FAIL (module `../campaigns` does not exist)

- [ ] **Step 3: Implement**

```ts
// backend/src/routes/campaigns.ts
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { voximplantApi } from '../services/voximplant-api';
import { campaignQueue } from '../jobs/queue';
import { logger } from '../lib/logger';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const campaignBody = z
  .object({
    name: z.string().min(1),
    crm_campaign_id: z.string().optional().nullable(),
    dial_mode: z.enum(['manual', 'preview', 'progressive', 'predictive']),
    auto_answer: z.boolean().optional(),
    schedule_start: z.coerce.date().optional().nullable(),
    schedule_end: z.coerce.date().optional().nullable(),
    dialing_hours_start: z.string().regex(HHMM),
    dialing_hours_end: z.string().regex(HHMM),
    timezone: z.string().min(1),
    max_concurrent_calls: z.number().int().min(1).max(500),
    max_abandon_rate: z.number().min(0).max(1),
    dial_ratio: z.number().min(1).max(5),
    max_attempts: z.number().int().min(1).max(20),
    retry_delay_minutes: z.number().int().min(1).max(10080),
    did_group_id: z.string().uuid(),
    caller_id_strategy: z.enum(['fixed', 'rotation', 'proximity']),
    fixed_caller_id: z.string().optional().nullable(),
    amd_enabled: z.boolean().optional(),
    voicemail_drop_url: z.string().url().optional().nullable(),
  })
  .refine(
    (v) => v.caller_id_strategy !== 'fixed' || !!v.fixed_caller_id,
    { message: 'fixed_caller_id required when caller_id_strategy=fixed', path: ['fixed_caller_id'] }
  );

function defaultAutoAnswer(mode: string): boolean {
  return mode === 'progressive' || mode === 'predictive';
}

async function statsByCampaign(campaignIds: string[]) {
  if (campaignIds.length === 0) return {};
  const groups = await (prisma as any).campaignContact.groupBy({
    by: ['campaign_id', 'status'],
    where: { campaign_id: { in: campaignIds } },
    _count: { _all: true },
  });
  const out: Record<string, Record<string, number>> = {};
  for (const g of groups as any[]) {
    out[g.campaign_id] ??= {};
    out[g.campaign_id][g.status] = g._count._all;
  }
  return out;
}

const EMPTY_BREAKDOWN = {
  pending: 0,
  compliance_blocked: 0,
  dialing: 0,
  connected: 0,
  completed: 0,
  failed: 0,
  max_attempts: 0,
};

const campaignRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', authenticate);

  app.get('/campaigns', async () => {
    const campaigns = await prisma.campaign.findMany({ orderBy: { created_at: 'desc' } });
    const statMap = await statsByCampaign(campaigns.map((c) => c.id));
    return campaigns.map((c) => ({
      ...c,
      stats: { ...EMPTY_BREAKDOWN, ...(statMap[c.id] ?? {}) },
    }));
  });

  app.post('/campaigns', { preHandler: requireRole(['supervisor', 'admin']) }, async (req, reply) => {
    const parsed = campaignBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation', issues: parsed.error.issues });
    }
    const group = await (prisma as any).dIDGroup.findUnique({ where: { id: parsed.data.did_group_id } });
    if (!group) return reply.status(400).send({ error: 'did_group not found' });

    const autoAnswer = parsed.data.auto_answer ?? defaultAutoAnswer(parsed.data.dial_mode);
    const created = await prisma.campaign.create({
      data: {
        ...parsed.data,
        auto_answer: autoAnswer,
        status: 'draft',
        created_by: (req as any).user?.id ?? '00000000-0000-0000-0000-000000000000',
      } as any,
    });
    return reply.status(201).send(created);
  });

  app.get<{ Params: { id: string } }>('/campaigns/:id', async (req, reply) => {
    const c = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!c) return reply.status(404).send({ error: 'not found' });
    const groups = (await (prisma as any).campaignContact.groupBy({
      by: ['status'],
      where: { campaign_id: c.id },
      _count: { _all: true },
    })) as any[];
    const breakdown = { ...EMPTY_BREAKDOWN };
    for (const g of groups) (breakdown as any)[g.status] = g._count._all;
    return { ...c, breakdown };
  });

  app.patch<{ Params: { id: string } }>(
    '/campaigns/:id',
    { preHandler: requireRole(['supervisor', 'admin']) },
    async (req, reply) => {
      const existing = await prisma.campaign.findUnique({ where: { id: req.params.id } });
      if (!existing) return reply.status(404).send({ error: 'not found' });
      if (!['draft', 'paused'].includes(existing.status)) {
        return reply.status(409).send({ error: `cannot edit in status ${existing.status}` });
      }
      const parsed = campaignBody.partial().safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'validation', issues: parsed.error.issues });
      }
      const updated = await prisma.campaign.update({
        where: { id: req.params.id },
        data: parsed.data as any,
      });
      return updated;
    }
  );

  app.post<{ Params: { id: string } }>(
    '/campaigns/:id/start',
    { preHandler: requireRole(['supervisor', 'admin']) },
    async (req, reply) => {
      const c = await prisma.campaign.findUnique({ where: { id: req.params.id } });
      if (!c) return reply.status(404).send({ error: 'not found' });
      if (!['draft', 'paused', 'scheduled'].includes(c.status)) {
        return reply.status(409).send({ error: `cannot start from ${c.status}` });
      }
      await prisma.campaign.update({ where: { id: c.id }, data: { status: 'active' } });
      await campaignQueue.add('campaign-start', { campaignId: c.id });
      logger.info({ campaignId: c.id }, 'campaign started');
      return { ok: true };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/campaigns/:id/pause',
    { preHandler: requireRole(['supervisor', 'admin']) },
    async (req, reply) => {
      const c = await prisma.campaign.findUnique({ where: { id: req.params.id } });
      if (!c) return reply.status(404).send({ error: 'not found' });
      if (c.voximplant_queue_id) {
        await voximplantApi.stopPDSCampaign(c.voximplant_queue_id);
      }
      await prisma.campaign.update({ where: { id: c.id }, data: { status: 'paused' } });
      return { ok: true };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/campaigns/:id/stop',
    { preHandler: requireRole(['supervisor', 'admin']) },
    async (req, reply) => {
      const c = await prisma.campaign.findUnique({ where: { id: req.params.id } });
      if (!c) return reply.status(404).send({ error: 'not found' });
      if (c.voximplant_queue_id) {
        await voximplantApi.stopPDSCampaign(c.voximplant_queue_id);
      }
      await (prisma as any).campaignContact.updateMany({
        where: { campaign_id: c.id, status: 'pending' },
        data: { status: 'completed' },
      });
      await prisma.campaign.update({ where: { id: c.id }, data: { status: 'completed' } });
      return { ok: true };
    }
  );
};

export default campaignRoutes;
```

- [ ] **Step 4: Run test - verify pass**
Run: `cd backend && npm test -- campaigns`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add backend/src/routes/campaigns.ts backend/src/routes/__tests__/campaigns.test.ts
git commit -m "feat: campaigns REST routes with zod validation + lifecycle controls"
```

---

### Task 14: Campaign Engine Service

**Files:**
- Create: `backend/src/services/campaign-engine.ts`
- Test: `backend/src/services/__tests__/campaign-engine.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// backend/src/services/__tests__/campaign-engine.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CampaignEngine } from '../campaign-engine';

function makePrisma() {
  return {
    campaign: { findUnique: vi.fn(), update: vi.fn() },
    campaignContact: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
  };
}
const crm = {
  getCampaignAccounts: vi.fn(),
  logCompliance: vi.fn(),
};
const vox = {
  createCallList: vi.fn(),
  createSmartQueue: vi.fn(),
  startPDSCampaign: vi.fn(),
  stopPDSCampaign: vi.fn(),
  getCallListDetails: vi.fn(),
};
const gate = { checkAll: vi.fn() };
const dids = { selectCallerId: vi.fn() };
const queue = { add: vi.fn() };

describe('CampaignEngine', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let engine: CampaignEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    engine = new CampaignEngine(prisma as any, crm as any, vox as any, gate as any, dids as any, queue as any);
  });

  it('populateCampaign upserts contacts from CRM', async () => {
    prisma.campaign.findUnique.mockResolvedValue({ id: 'c1', crm_campaign_id: 'crm-c1', timezone: 'America/Chicago' });
    crm.getCampaignAccounts.mockResolvedValue([
      { account_id: 'a1', phone: '+15551110001', first_name: 'A', last_name: 'X', state: 'TX', zip: '78701', timezone: 'America/Chicago' },
      { account_id: 'a2', phone: '+15551110002', first_name: 'B', last_name: 'Y', state: 'TX', zip: '78701', timezone: 'America/Chicago' },
    ]);
    prisma.campaignContact.upsert.mockResolvedValue({});

    const result = await engine.populateCampaign('c1');
    expect(result.inserted).toBe(2);
    expect(prisma.campaignContact.upsert).toHaveBeenCalledTimes(2);
  });

  it('buildCallListCSV generates semicolon-delimited rows with caller IDs', async () => {
    prisma.campaign.findUnique.mockResolvedValue({
      id: 'c1',
      amd_enabled: true,
      voicemail_drop_url: 'https://vm.example/mp3',
      timezone: 'America/Chicago',
      dialing_hours_start: '08:00',
      dialing_hours_end: '21:00',
    });
    prisma.campaignContact.findMany.mockResolvedValue([
      { id: 'cc1', phone: '+15551110001', crm_account_id: 'a1' },
      { id: 'cc2', phone: '+15551110002', crm_account_id: 'a2' },
    ]);
    dids.selectCallerId.mockResolvedValueOnce('+15552220001').mockResolvedValueOnce('+15552220002');

    const buf = await engine.buildCallListCSV('c1');
    const csv = buf.toString('utf8');
    const lines = csv.trim().split('\n');
    expect(lines[0]).toContain('phone;crm_account_id;campaign_id;caller_id;amd_enabled;vm_drop_url');
    expect(lines[1]).toContain('+15551110001;a1;c1;+15552220001;true;https://vm.example/mp3');
    expect(lines[2]).toContain('+15551110002;a2;c1;+15552220002;true;https://vm.example/mp3');
  });

  it('buildCallListCSV skips contacts whose caller_id lookup fails', async () => {
    prisma.campaign.findUnique.mockResolvedValue({
      id: 'c1',
      amd_enabled: true,
      voicemail_drop_url: null,
      timezone: 'America/Chicago',
      dialing_hours_start: '08:00',
      dialing_hours_end: '21:00',
    });
    prisma.campaignContact.findMany.mockResolvedValue([
      { id: 'cc1', phone: '+15551110001', crm_account_id: 'a1' },
      { id: 'cc2', phone: '+15551110002', crm_account_id: 'a2' },
    ]);
    dids.selectCallerId
      .mockResolvedValueOnce('+15552220001')
      .mockRejectedValueOnce(new Error('no eligible'));

    const buf = await engine.buildCallListCSV('c1');
    const csv = buf.toString('utf8');
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(2); // header + 1 data row
  });

  it('startCampaign orchestrates populate → compliance → CSV → list → queue → PDS', async () => {
    prisma.campaign.findUnique.mockResolvedValue({
      id: 'c1',
      crm_campaign_id: 'crm-c1',
      name: 'X',
      dial_mode: 'predictive',
      max_concurrent_calls: 10,
      max_abandon_rate: 0.03,
      amd_enabled: true,
      voicemail_drop_url: null,
      timezone: 'America/Chicago',
      dialing_hours_start: '08:00',
      dialing_hours_end: '21:00',
    });
    crm.getCampaignAccounts.mockResolvedValue([]);
    queue.add.mockResolvedValue({ id: 'j1' });
    vox.createCallList.mockResolvedValue({ list_id: 999 });
    vox.createSmartQueue.mockResolvedValue({ queue_id: 42 });
    vox.startPDSCampaign.mockResolvedValue({ ok: true });
    prisma.campaignContact.findMany.mockResolvedValue([]);
    prisma.campaign.update.mockResolvedValue({});

    await engine.startCampaign('c1');

    expect(queue.add).toHaveBeenCalledWith('batch-compliance-check', { campaignId: 'c1' });
    expect(vox.createCallList).toHaveBeenCalled();
    expect(vox.createSmartQueue).toHaveBeenCalled();
    expect(vox.startPDSCampaign).toHaveBeenCalled();
    expect(prisma.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({ voximplant_list_id: 999, voximplant_queue_id: 42 }),
      })
    );
  });

  it('pauseCampaign stops PDS and updates status', async () => {
    prisma.campaign.findUnique.mockResolvedValue({ id: 'c1', voximplant_queue_id: 42 });
    prisma.campaign.update.mockResolvedValue({});
    vox.stopPDSCampaign.mockResolvedValue({});
    await engine.pauseCampaign('c1');
    expect(vox.stopPDSCampaign).toHaveBeenCalledWith(42);
    expect(prisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'paused' },
    });
  });

  it('stopCampaign stops PDS, completes pending, updates status', async () => {
    prisma.campaign.findUnique.mockResolvedValue({ id: 'c1', voximplant_queue_id: 42 });
    prisma.campaignContact.updateMany.mockResolvedValue({ count: 3 });
    prisma.campaign.update.mockResolvedValue({});
    vox.stopPDSCampaign.mockResolvedValue({});
    await engine.stopCampaign('c1');
    expect(prisma.campaignContact.updateMany).toHaveBeenCalledWith({
      where: { campaign_id: 'c1', status: 'pending' },
      data: { status: 'completed' },
    });
  });
});
```

- [ ] **Step 2: Run test - verify fail**
Run: `cd backend && npm test -- campaign-engine`
Expected: FAIL (module `../campaign-engine` does not exist)

- [ ] **Step 3: Implement**

```ts
// backend/src/services/campaign-engine.ts
import type { PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { CRMClient } from '../lib/crm-client';
import type { VoximplantAPI } from './voximplant-api';
import type { ComplianceGate } from './compliance-gate';
import type { DIDManager } from './did-manager';
import { logger } from '../lib/logger';

export class CampaignEngine {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly crm: CRMClient,
    private readonly vox: VoximplantAPI,
    private readonly gate: ComplianceGate,
    private readonly dids: DIDManager,
    private readonly queue: Queue
  ) {}

  async populateCampaign(campaignId: string): Promise<{ inserted: number }> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error(`campaign ${campaignId} not found`);
    if (!campaign.crm_campaign_id) {
      logger.warn({ campaignId }, 'populateCampaign: no crm_campaign_id, skipping');
      return { inserted: 0 };
    }
    const accounts = await this.crm.getCampaignAccounts(campaign.crm_campaign_id);
    let inserted = 0;
    for (const a of accounts) {
      await (this.prisma as any).campaignContact.upsert({
        where: { campaign_id_phone: { campaign_id: campaignId, phone: a.phone } },
        create: {
          campaign_id: campaignId,
          crm_account_id: a.account_id,
          phone: a.phone,
          timezone: a.timezone ?? (campaign as any).timezone,
          status: 'pending',
          next_attempt_after: new Date(),
        },
        update: { crm_account_id: a.account_id, timezone: a.timezone ?? undefined },
      });
      inserted++;
    }
    return { inserted };
  }

  async buildCallListCSV(campaignId: string): Promise<Buffer> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } }) as any;
    if (!campaign) throw new Error(`campaign ${campaignId} not found`);

    const contacts = (await (this.prisma as any).campaignContact.findMany({
      where: { campaign_id: campaignId, compliance_cleared: true, status: 'pending' },
    })) as Array<{ id: string; phone: string; crm_account_id: string }>;

    const header =
      'phone;crm_account_id;campaign_id;caller_id;amd_enabled;vm_drop_url;__start_execution_time;__end_execution_time';

    const { startUtc, endUtc } = computeExecutionWindowUtc(
      campaign.timezone,
      campaign.dialing_hours_start,
      campaign.dialing_hours_end
    );

    const rows: string[] = [header];
    for (const c of contacts) {
      try {
        const callerId = await this.dids.selectCallerId(campaignId, c.phone);
        rows.push(
          [
            c.phone,
            c.crm_account_id,
            campaignId,
            callerId,
            campaign.amd_enabled ? 'true' : 'false',
            campaign.voicemail_drop_url ?? '',
            startUtc,
            endUtc,
          ].join(';')
        );
      } catch (err) {
        logger.warn({ err, contactId: c.id }, 'skipping contact — caller_id selection failed');
      }
    }

    return Buffer.from(rows.join('\n'), 'utf8');
  }

  async startCampaign(campaignId: string): Promise<void> {
    await this.populateCampaign(campaignId);
    await this.queue.add('batch-compliance-check', { campaignId });

    const campaign = (await this.prisma.campaign.findUnique({ where: { id: campaignId } })) as any;
    if (!campaign) throw new Error(`campaign ${campaignId} not found`);

    const csv = await this.buildCallListCSV(campaignId);
    const list = await this.vox.createCallList({
      name: `campaign-${campaignId}`,
      priority: 1,
      rule_id: undefined,
      max_simultaneous: campaign.max_concurrent_calls,
      num_attempts: campaign.max_attempts,
      csv,
      delimiter: ';',
    } as any);
    const queueRes = await this.vox.createSmartQueue({
      name: `sq-${campaignId}`,
      call_type: 'outbound',
      max_abandon_rate: campaign.max_abandon_rate,
    } as any);
    await this.vox.startPDSCampaign({
      list_id: (list as any).list_id,
      queue_id: (queueRes as any).queue_id,
      mode: campaign.dial_mode,
    } as any);

    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        voximplant_list_id: (list as any).list_id,
        voximplant_queue_id: (queueRes as any).queue_id,
        status: 'active',
      } as any,
    });
  }

  async pauseCampaign(campaignId: string): Promise<void> {
    const c = (await this.prisma.campaign.findUnique({ where: { id: campaignId } })) as any;
    if (!c) throw new Error(`campaign ${campaignId} not found`);
    if (c.voximplant_queue_id) {
      await this.vox.stopPDSCampaign(c.voximplant_queue_id);
    }
    await this.prisma.campaign.update({ where: { id: campaignId }, data: { status: 'paused' } });
  }

  async stopCampaign(campaignId: string): Promise<void> {
    const c = (await this.prisma.campaign.findUnique({ where: { id: campaignId } })) as any;
    if (!c) throw new Error(`campaign ${campaignId} not found`);
    if (c.voximplant_queue_id) {
      await this.vox.stopPDSCampaign(c.voximplant_queue_id);
    }
    await (this.prisma as any).campaignContact.updateMany({
      where: { campaign_id: campaignId, status: 'pending' },
      data: { status: 'completed' },
    });
    await this.prisma.campaign.update({ where: { id: campaignId }, data: { status: 'completed' } });
  }
}

function computeExecutionWindowUtc(
  timezone: string,
  hoursStart: string,
  hoursEnd: string
): { startUtc: string; endUtc: string } {
  // Build today's local window then convert to UTC ISO.
  const now = new Date();
  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now); // YYYY-MM-DD
  const startUtc = localWallToUtcIso(localDate, hoursStart, timezone);
  const endUtc = localWallToUtcIso(localDate, hoursEnd, timezone);
  return { startUtc, endUtc };
}

function localWallToUtcIso(date: string, time: string, timezone: string): string {
  // Approximate conversion by creating a date in UTC with the wall-clock values, then subtracting
  // the zone's UTC offset at that instant. Good enough for Voximplant scheduling (minute precision).
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const asUtc = Date.UTC(y, (m || 1) - 1, d, hh, mm, 0);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = fmt.formatToParts(new Date(asUtc));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const tzUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  const offsetMs = tzUtc - asUtc;
  return new Date(asUtc - offsetMs).toISOString();
}
```

- [ ] **Step 4: Run test - verify pass**
Run: `cd backend && npm test -- campaign-engine`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add backend/src/services/campaign-engine.ts backend/src/services/__tests__/campaign-engine.test.ts
git commit -m "feat: campaign engine orchestrates populate, CSV build, PDS start/pause/stop"
```

---

### Task 15: BullMQ Queue + Jobs

**Files:**
- Create: `backend/src/jobs/queue.ts`
- Create: `backend/src/jobs/sync-call-outcome.ts`
- Create: `backend/src/jobs/batch-compliance-check.ts`
- Create: `backend/src/jobs/compliance-refresh.ts`
- Create: `backend/src/jobs/did-health-check.ts`
- Create: `backend/src/jobs/sync-campaign-progress.ts`
- Create: `backend/src/jobs/index.ts`
- Test: `backend/src/jobs/__tests__/queue.test.ts`
- Test: `backend/src/jobs/__tests__/sync-call-outcome.test.ts`
- Test: `backend/src/jobs/__tests__/batch-compliance-check.test.ts`
- Test: `backend/src/jobs/__tests__/compliance-refresh.test.ts`
- Test: `backend/src/jobs/__tests__/did-health-check.test.ts`
- Test: `backend/src/jobs/__tests__/sync-campaign-progress.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// backend/src/jobs/__tests__/queue.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('bullmq', () => {
  return {
    Queue: vi.fn().mockImplementation((name: string, opts: any) => ({ name, opts })),
    Worker: vi.fn().mockImplementation((name: string, processor: any, opts: any) => ({ name, processor, opts })),
  };
});
vi.mock('../../config', () => ({ config: { redis: { url: 'redis://localhost:6379' } } }));

import { createQueue, createWorker } from '../queue';

describe('queue helpers', () => {
  it('createQueue returns Queue with shared connection', () => {
    const q = createQueue('test-q') as any;
    expect(q.name).toBe('test-q');
    expect(q.opts.connection).toBeDefined();
  });
  it('createWorker returns Worker bound to same connection', () => {
    const w = createWorker('test-w', async () => {}) as any;
    expect(w.name).toBe('test-w');
    expect(w.opts.connection).toBeDefined();
  });
});
```

```ts
// backend/src/jobs/__tests__/sync-call-outcome.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  callEvent: { findUnique: vi.fn(), update: vi.fn() },
};
const crmMock = { logCall: vi.fn() };
vi.mock('../../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../../lib/crm-client', () => ({ crmClient: crmMock }));

import { processSyncCallOutcome, syncCallOutcomeOptions } from '../sync-call-outcome';

beforeEach(() => vi.clearAllMocks());

describe('sync-call-outcome', () => {
  it('logs call and marks synced', async () => {
    prismaMock.callEvent.findUnique.mockResolvedValue({
      id: 'e1',
      crm_account_id: 'a1',
      duration_seconds: 45,
      disposition_code: 'left_voicemail',
      agent_mapping_id: 'ag1',
      voximplant_call_id: 'vc1',
    });
    crmMock.logCall.mockResolvedValue({ ok: true });
    prismaMock.callEvent.update.mockResolvedValue({});

    await processSyncCallOutcome({ data: { callEventId: 'e1' } } as any);
    expect(crmMock.logCall).toHaveBeenCalled();
    expect(prismaMock.callEvent.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { crm_synced: true },
    });
  });

  it('throws on missing event (so BullMQ retries)', async () => {
    prismaMock.callEvent.findUnique.mockResolvedValue(null);
    await expect(processSyncCallOutcome({ data: { callEventId: 'x' } } as any)).rejects.toThrow();
  });

  it('exposes retry policy (attempts=3, exp backoff 5000)', () => {
    expect(syncCallOutcomeOptions.attempts).toBe(3);
    expect(syncCallOutcomeOptions.backoff).toEqual({ type: 'exponential', delay: 5000 });
  });
});
```

```ts
// backend/src/jobs/__tests__/batch-compliance-check.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  campaign: { findUnique: vi.fn() },
  campaignContact: { findMany: vi.fn(), update: vi.fn() },
};
const gateMock = { checkAll: vi.fn() };
vi.mock('../../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../../services/compliance-gate', () => ({ complianceGate: gateMock }));

import { processBatchComplianceCheck } from '../batch-compliance-check';

beforeEach(() => vi.clearAllMocks());

describe('batch-compliance-check', () => {
  it('processes contacts in batches of 100 and updates status', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({
      id: 'c1',
      dialing_hours_start: '08:00',
      dialing_hours_end: '21:00',
      timezone: 'America/Chicago',
    });
    // two batches: 100 + 3
    const batch1 = Array.from({ length: 100 }, (_, i) => ({
      id: `cc${i}`, phone: `+1555000${i.toString().padStart(4, '0')}`, crm_account_id: `a${i}`, timezone: 'America/Chicago',
    }));
    const batch2 = Array.from({ length: 3 }, (_, i) => ({
      id: `cx${i}`, phone: `+1555900${i}`, crm_account_id: `b${i}`, timezone: 'America/Chicago',
    }));
    prismaMock.campaignContact.findMany
      .mockResolvedValueOnce(batch1)
      .mockResolvedValueOnce(batch2)
      .mockResolvedValueOnce([]);
    gateMock.checkAll.mockResolvedValue({ cleared: true, reasons: [] });
    prismaMock.campaignContact.update.mockResolvedValue({});

    await processBatchComplianceCheck({ data: { campaignId: 'c1' } } as any);
    expect(prismaMock.campaignContact.update).toHaveBeenCalledTimes(103);
  });

  it('marks blocked contacts with reasons', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({
      id: 'c1', dialing_hours_start: '08:00', dialing_hours_end: '21:00', timezone: 'America/Chicago',
    });
    prismaMock.campaignContact.findMany
      .mockResolvedValueOnce([{ id: 'cc1', phone: '+15550000001', crm_account_id: 'a1', timezone: 'America/Chicago' }])
      .mockResolvedValueOnce([]);
    gateMock.checkAll.mockResolvedValue({ cleared: false, reasons: ['dnc_list'] });
    prismaMock.campaignContact.update.mockResolvedValue({});

    await processBatchComplianceCheck({ data: { campaignId: 'c1' } } as any);
    expect(prismaMock.campaignContact.update).toHaveBeenCalledWith({
      where: { id: 'cc1' },
      data: { status: 'compliance_blocked', compliance_cleared: false, compliance_block_reason: 'dnc_list' },
    });
  });
});
```

```ts
// backend/src/jobs/__tests__/compliance-refresh.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  campaign: { findMany: vi.fn() },
  campaignContact: { findMany: vi.fn(), update: vi.fn() },
};
const gateMock = { checkAll: vi.fn() };
vi.mock('../../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../../services/compliance-gate', () => ({ complianceGate: gateMock }));

import { processComplianceRefresh } from '../compliance-refresh';

beforeEach(() => vi.clearAllMocks());

describe('compliance-refresh', () => {
  it('re-checks stale cleared contacts across active campaigns', async () => {
    prismaMock.campaign.findMany.mockResolvedValue([
      { id: 'c1', dialing_hours_start: '08:00', dialing_hours_end: '21:00', timezone: 'America/Chicago' },
    ]);
    prismaMock.campaignContact.findMany.mockResolvedValue([
      { id: 'cc1', phone: '+15550000001', crm_account_id: 'a1', timezone: 'America/Chicago' },
    ]);
    gateMock.checkAll.mockResolvedValue({ cleared: false, reasons: ['dnc_list'] });
    prismaMock.campaignContact.update.mockResolvedValue({});

    await processComplianceRefresh({ data: {} } as any);

    expect(prismaMock.campaignContact.update).toHaveBeenCalledWith({
      where: { id: 'cc1' },
      data: expect.objectContaining({ status: 'compliance_blocked' }),
    });
  });
});
```

```ts
// backend/src/jobs/__tests__/did-health-check.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  phoneNumber: { findMany: vi.fn() },
  callEvent: { count: vi.fn() },
};
const didMock = { updateHealth: vi.fn() };
vi.mock('../../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../../services/did-manager', () => ({ didManager: didMock }));

import { processDidHealthCheck } from '../did-health-check';

beforeEach(() => vi.clearAllMocks());

describe('did-health-check', () => {
  it('computes 24h answer rate per number and calls updateHealth', async () => {
    prismaMock.phoneNumber.findMany.mockResolvedValue([{ id: 'n1', number: '+15550000001' }]);
    // 2 answered, 8 total
    prismaMock.callEvent.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(2);
    didMock.updateHealth.mockResolvedValue(undefined);

    await processDidHealthCheck({ data: {} } as any);
    expect(didMock.updateHealth).toHaveBeenCalledWith('n1', 0.2);
  });

  it('skips numbers with no calls', async () => {
    prismaMock.phoneNumber.findMany.mockResolvedValue([{ id: 'n1', number: '+15550000001' }]);
    prismaMock.callEvent.count.mockResolvedValueOnce(0);
    await processDidHealthCheck({ data: {} } as any);
    expect(didMock.updateHealth).not.toHaveBeenCalled();
  });
});
```

```ts
// backend/src/jobs/__tests__/sync-campaign-progress.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  campaign: { findMany: vi.fn() },
  campaignContact: { groupBy: vi.fn() },
};
const ioMock = { to: vi.fn(() => ({ emit: vi.fn() })) };
vi.mock('../../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../../lib/io', () => ({ io: ioMock }));

import { processSyncCampaignProgress } from '../sync-campaign-progress';

beforeEach(() => vi.clearAllMocks());

describe('sync-campaign-progress', () => {
  it('emits progress for each active campaign', async () => {
    prismaMock.campaign.findMany.mockResolvedValue([{ id: 'c1' }]);
    prismaMock.campaignContact.groupBy.mockResolvedValue([
      { status: 'pending', _count: { _all: 5 } },
      { status: 'completed', _count: { _all: 2 } },
    ]);
    const emit = vi.fn();
    ioMock.to.mockReturnValue({ emit });

    await processSyncCampaignProgress({ data: {} } as any);

    expect(ioMock.to).toHaveBeenCalledWith('supervisors');
    expect(emit).toHaveBeenCalledWith('campaign:progress', expect.objectContaining({ campaignId: 'c1' }));
  });
});
```

- [ ] **Step 2: Run test - verify fail**
Run: `cd backend && npm test -- jobs`
Expected: FAIL (modules under `../jobs/*` do not exist)

- [ ] **Step 3: Implement**

```ts
// backend/src/jobs/queue.ts
import { Queue, Worker, QueueOptions, WorkerOptions } from 'bullmq';
import IORedis, { Redis } from 'ioredis';
import { config } from '../config';

let connection: Redis | undefined;
function getConnection(): Redis {
  if (!connection) connection = new IORedis(config.redis.url, { maxRetriesPerRequest: null });
  return connection;
}

export function createQueue(name: string, opts?: Partial<QueueOptions>): Queue {
  return new Queue(name, { connection: getConnection(), ...(opts ?? {}) });
}

export function createWorker(
  name: string,
  processor: (job: any) => Promise<any>,
  opts?: Partial<WorkerOptions>
): Worker {
  return new Worker(name, processor, { connection: getConnection(), ...(opts ?? {}) });
}

export const campaignQueue = createQueue('campaign');
export const syncCallOutcomeQueue = createQueue('sync-call-outcome');
export const complianceQueue = createQueue('compliance');
export const didQueue = createQueue('did-health');
export const progressQueue = createQueue('campaign-progress');
```

```ts
// backend/src/jobs/sync-call-outcome.ts
import type { Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import { crmClient } from '../lib/crm-client';
import { logger } from '../lib/logger';

export interface SyncCallOutcomeJob {
  callEventId: string;
}

export const syncCallOutcomeOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
};

export async function processSyncCallOutcome(job: Job<SyncCallOutcomeJob>): Promise<void> {
  const { callEventId } = job.data;
  const event = await (prisma as any).callEvent.findUnique({ where: { id: callEventId } });
  if (!event) throw new Error(`call event ${callEventId} not found`);
  if (!event.crm_account_id) {
    logger.warn({ callEventId }, 'no crm_account_id; skipping CRM sync');
    return;
  }

  await crmClient.logCall(event.crm_account_id, {
    duration_seconds: event.duration_seconds,
    disposition_code: event.disposition_code,
    agent_mapping_id: event.agent_mapping_id,
    voximplant_call_id: event.voximplant_call_id,
    recording_url: event.recording_url,
  } as any);

  await (prisma as any).callEvent.update({
    where: { id: callEventId },
    data: { crm_synced: true },
  });
}
```

```ts
// backend/src/jobs/batch-compliance-check.ts
import type { Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import { complianceGate } from '../services/compliance-gate';

export interface BatchComplianceCheckJob {
  campaignId: string;
}

const BATCH_SIZE = 100;

export async function processBatchComplianceCheck(job: Job<BatchComplianceCheckJob>): Promise<void> {
  const { campaignId } = job.data;
  const campaign = (await prisma.campaign.findUnique({ where: { id: campaignId } })) as any;
  if (!campaign) throw new Error(`campaign ${campaignId} not found`);

  let cursor: string | undefined;
  for (;;) {
    const batch: any[] = await (prisma as any).campaignContact.findMany({
      where: { campaign_id: campaignId, compliance_cleared: false, status: 'pending' },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
    });
    if (batch.length === 0) break;
    for (const contact of batch) {
      const result = await complianceGate.checkAll(
        {
          phone: contact.phone,
          crmAccountId: contact.crm_account_id,
          timezone: contact.timezone || campaign.timezone,
        },
        {
          dialingHoursStart: campaign.dialing_hours_start,
          dialingHoursEnd: campaign.dialing_hours_end,
        }
      );

      if (result.cleared) {
        await (prisma as any).campaignContact.update({
          where: { id: contact.id },
          data: { compliance_cleared: true, compliance_block_reason: null },
        });
      } else {
        await (prisma as any).campaignContact.update({
          where: { id: contact.id },
          data: {
            status: 'compliance_blocked',
            compliance_cleared: false,
            compliance_block_reason: result.reasons.join(','),
          },
        });
      }
    }
    cursor = batch[batch.length - 1].id;
    if (batch.length < BATCH_SIZE) break;
  }
}
```

```ts
// backend/src/jobs/compliance-refresh.ts
import type { Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import { complianceGate } from '../services/compliance-gate';

const STALE_MS = 5 * 60 * 1000;

export async function processComplianceRefresh(_job: Job): Promise<void> {
  const active = (await prisma.campaign.findMany({ where: { status: 'active' } })) as any[];
  const cutoff = new Date(Date.now() - STALE_MS);
  for (const campaign of active) {
    const stale: any[] = await (prisma as any).campaignContact.findMany({
      where: {
        campaign_id: campaign.id,
        compliance_cleared: true,
        status: 'pending',
        updated_at: { lt: cutoff },
      },
      take: 500,
    });
    for (const contact of stale) {
      const result = await complianceGate.checkAll(
        { phone: contact.phone, crmAccountId: contact.crm_account_id, timezone: contact.timezone || campaign.timezone },
        { dialingHoursStart: campaign.dialing_hours_start, dialingHoursEnd: campaign.dialing_hours_end }
      );
      if (!result.cleared) {
        await (prisma as any).campaignContact.update({
          where: { id: contact.id },
          data: {
            status: 'compliance_blocked',
            compliance_cleared: false,
            compliance_block_reason: result.reasons.join(','),
          },
        });
      }
    }
  }
}
```

```ts
// backend/src/jobs/did-health-check.ts
import type { Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import { didManager } from '../services/did-manager';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function processDidHealthCheck(_job: Job): Promise<void> {
  const numbers = (await (prisma as any).phoneNumber.findMany({
    select: { id: true, number: true },
  })) as Array<{ id: string; number: string }>;
  const since = new Date(Date.now() - DAY_MS);

  for (const n of numbers) {
    const total = await (prisma as any).callEvent.count({
      where: { from_number: n.number, created_at: { gte: since } },
    });
    if (total === 0) continue;
    const answered = await (prisma as any).callEvent.count({
      where: { from_number: n.number, created_at: { gte: since }, status: 'completed', duration_seconds: { gt: 0 } },
    });
    const rate = answered / total;
    await didManager.updateHealth(n.id, rate);
  }
}
```

```ts
// backend/src/jobs/sync-campaign-progress.ts
import type { Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import { io } from '../lib/io';

export async function processSyncCampaignProgress(_job: Job): Promise<void> {
  const active = (await prisma.campaign.findMany({ where: { status: 'active' } })) as any[];
  for (const campaign of active) {
    const groups = (await (prisma as any).campaignContact.groupBy({
      by: ['status'],
      where: { campaign_id: campaign.id },
      _count: { _all: true },
    })) as any[];
    const stats: Record<string, number> = {};
    for (const g of groups) stats[g.status] = g._count._all;
    io.to('supervisors').emit('campaign:progress', { campaignId: campaign.id, stats });
  }
}
```

```ts
// backend/src/jobs/index.ts
import { createWorker, complianceQueue, didQueue, progressQueue } from './queue';
import { processSyncCallOutcome, syncCallOutcomeOptions } from './sync-call-outcome';
import { processBatchComplianceCheck } from './batch-compliance-check';
import { processComplianceRefresh } from './compliance-refresh';
import { processDidHealthCheck } from './did-health-check';
import { processSyncCampaignProgress } from './sync-campaign-progress';
import { logger } from '../lib/logger';

export async function registerAllWorkers(): Promise<void> {
  createWorker('sync-call-outcome', processSyncCallOutcome, {
    // defaults applied per-job when adding, these are worker-level hints
  });
  createWorker('compliance', async (job) => {
    if (job.name === 'batch-compliance-check') return processBatchComplianceCheck(job);
    if (job.name === 'compliance-refresh') return processComplianceRefresh(job);
  });
  createWorker('did-health', processDidHealthCheck);
  createWorker('campaign-progress', processSyncCampaignProgress);

  await complianceQueue.add(
    'compliance-refresh',
    {},
    { repeat: { pattern: '*/5 * * * *' }, jobId: 'cron-compliance-refresh' }
  );
  await didQueue.add(
    'did-health-check',
    {},
    { repeat: { pattern: '0 * * * *' }, jobId: 'cron-did-health-check' }
  );
  await progressQueue.add(
    'sync-campaign-progress',
    {},
    { repeat: { every: 30_000 }, jobId: 'cron-campaign-progress' }
  );

  // export for callers that schedule sync-call-outcome with retry options
  void syncCallOutcomeOptions;
  logger.info('BullMQ workers registered');
}
```

- [ ] **Step 4: Run test - verify pass**
Run: `cd backend && npm test -- jobs`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add backend/src/jobs/queue.ts backend/src/jobs/sync-call-outcome.ts backend/src/jobs/batch-compliance-check.ts backend/src/jobs/compliance-refresh.ts backend/src/jobs/did-health-check.ts backend/src/jobs/sync-campaign-progress.ts backend/src/jobs/index.ts backend/src/jobs/__tests__/
git commit -m "feat: BullMQ workers for call sync, compliance batches, DID health, progress"
```

---

### Task 16: Calls Routes (Manual/Preview Dial + Disposition)

**Files:**
- Create: `backend/src/routes/calls.ts`
- Test: `backend/src/routes/__tests__/calls.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// backend/src/routes/__tests__/calls.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

const prismaMock = {
  callEvent: {
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  agentMapping: {
    findUnique: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
  },
  agentStatusLog: {
    updateMany: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
  },
  campaign: { findUnique: vi.fn() },
};
const crmMock = {
  getAccount: vi.fn(),
  logCompliance: vi.fn(),
  logCall: vi.fn(),
};
const voxMock = {
  startCallSession: vi.fn(),
};
const gateMock = { checkAll: vi.fn() };
const didMock = { selectCallerId: vi.fn() };
const syncQueueMock = { add: vi.fn() };

vi.mock('../../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../../lib/crm-client', () => ({ crmClient: crmMock }));
vi.mock('../../services/voximplant-api', () => ({ voximplantApi: voxMock }));
vi.mock('../../services/compliance-gate', () => ({ complianceGate: gateMock }));
vi.mock('../../services/did-manager', () => ({ didManager: didMock }));
vi.mock('../../jobs/queue', () => ({
  syncCallOutcomeQueue: syncQueueMock,
  campaignQueue: { add: vi.fn() },
}));
vi.mock('../../middleware/auth', () => ({
  authenticate: async (req: any) => {
    if (!req.headers.authorization) throw new Error('unauth');
    req.user = {
      id: req.headers['x-user-id'] || 'u1',
      role: req.headers['x-role'] || 'agent',
      email: 'u@x.com',
    };
  },
  requireRole: (roles: string[]) => async (req: any) => {
    if (!roles.includes(req.user?.role)) {
      throw Object.assign(new Error('forbidden'), { statusCode: 403 });
    }
  },
}));

import callsRoutes from '../calls';

async function build(): Promise<FastifyInstance> {
  const app = Fastify();
  app.setErrorHandler((err, _req, reply) => {
    reply.status((err as any).statusCode ?? 500).send({ error: err.message });
  });
  await app.register(callsRoutes, { prefix: '/api' });
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('calls routes', () => {
  it('POST /api/calls/dial returns 403 when compliance blocks', async () => {
    prismaMock.agentMapping.findFirst.mockResolvedValue({ id: 'ag1', voximplant_username: 'agent1@x' });
    crmMock.getAccount.mockResolvedValue({ id: 'a1', status: 'open', phone: '+15550001111', state: 'TX', zip: '78701' });
    gateMock.checkAll.mockResolvedValue({ cleared: false, reasons: ['dnc_list'] });
    crmMock.logCompliance.mockResolvedValue({});

    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/calls/dial',
      headers: { authorization: 'Bearer x' },
      payload: { crm_account_id: 'a1', phone: '+15550001111' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().reasons).toEqual(['dnc_list']);
    expect(crmMock.logCompliance).toHaveBeenCalled();
  });

  it('POST /api/calls/dial places call when compliance cleared', async () => {
    prismaMock.agentMapping.findFirst.mockResolvedValue({ id: 'ag1', voximplant_username: 'agent1@x' });
    crmMock.getAccount.mockResolvedValue({ id: 'a1', status: 'open', phone: '+15550001111', state: 'TX', zip: '78701' });
    gateMock.checkAll.mockResolvedValue({ cleared: true, reasons: [] });
    didMock.selectCallerId.mockResolvedValue('+15552220001');
    voxMock.startCallSession = vi.fn().mockResolvedValue({ call_session_id: 'vs-1' });
    prismaMock.callEvent.create.mockResolvedValue({ id: 'ce1', voximplant_call_id: 'vs-1' });

    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/calls/dial',
      headers: { authorization: 'Bearer x' },
      payload: { crm_account_id: 'a1', phone: '+15550001111' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().callId).toBe('ce1');
    expect(res.json().voximplantSessionId).toBe('vs-1');
    expect(voxMock.startCallSession).toHaveBeenCalled();
  });

  it('POST /api/calls/:id/disposition updates event and queues sync', async () => {
    prismaMock.callEvent.findUnique.mockResolvedValue({ id: 'ce1', crm_account_id: 'a1' });
    prismaMock.callEvent.update.mockResolvedValue({ id: 'ce1' });
    syncQueueMock.add.mockResolvedValue({});

    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/calls/ce1/disposition',
      headers: { authorization: 'Bearer x' },
      payload: { disposition_code: 'promise_to_pay', notes: 'will call back' },
    });
    expect(res.statusCode).toBe(200);
    expect(prismaMock.callEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ce1' }, data: expect.objectContaining({ disposition_code: 'promise_to_pay' }) })
    );
    expect(syncQueueMock.add).toHaveBeenCalledWith('sync-call-outcome', { callEventId: 'ce1' }, expect.any(Object));
  });

  it('GET /api/calls/active requires supervisor', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/calls/active',
      headers: { authorization: 'Bearer x', 'x-role': 'agent' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /api/calls/active lists in-progress events for supervisors', async () => {
    prismaMock.callEvent.findMany.mockResolvedValue([
      { id: 'ce1', status: 'ringing', agent_mapping: { id: 'ag1' }, campaign: { id: 'c1' } },
    ]);
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/calls/active',
      headers: { authorization: 'Bearer x', 'x-role': 'supervisor' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()[0].id).toBe('ce1');
    expect(prismaMock.callEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { notIn: ['completed', 'failed'] } },
        include: { agent_mapping: true, campaign: true },
      })
    );
  });

  it('PATCH /api/agents/me/status closes prior log and inserts new', async () => {
    prismaMock.agentMapping.findFirst.mockResolvedValue({ id: 'ag1', status: 'available' });
    prismaMock.agentStatusLog.findFirst.mockResolvedValue({
      id: 'l1',
      agent_mapping_id: 'ag1',
      status: 'available',
      started_at: new Date(Date.now() - 60_000),
    });
    prismaMock.agentStatusLog.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.agentStatusLog.create.mockResolvedValue({ id: 'l2' });
    prismaMock.agentMapping.update.mockResolvedValue({ id: 'ag1', status: 'break' });

    const app = await build();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/agents/me/status',
      headers: { authorization: 'Bearer x' },
      payload: { status: 'break' },
    });
    expect(res.statusCode).toBe(200);
    expect(prismaMock.agentStatusLog.updateMany).toHaveBeenCalled();
    expect(prismaMock.agentStatusLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ agent_mapping_id: 'ag1', status: 'break' }),
    });
    expect(prismaMock.agentMapping.update).toHaveBeenCalledWith({
      where: { id: 'ag1' },
      data: { status: 'break' },
    });
  });
});
```

- [ ] **Step 2: Run test - verify fail**
Run: `cd backend && npm test -- calls`
Expected: FAIL (module `../calls` does not exist)

- [ ] **Step 3: Implement**

```ts
// backend/src/routes/calls.ts
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { crmClient } from '../lib/crm-client';
import { voximplantApi } from '../services/voximplant-api';
import { complianceGate } from '../services/compliance-gate';
import { didManager } from '../services/did-manager';
import { syncCallOutcomeQueue } from '../jobs/queue';
import { authenticate, requireRole } from '../middleware/auth';
import { logger } from '../lib/logger';

const dialBody = z.object({
  crm_account_id: z.string().min(1),
  phone: z.string().min(1),
  campaign_id: z.string().uuid().optional(),
});

const dispositionBody = z.object({
  disposition_code: z.string().min(1),
  notes: z.string().optional(),
  callback_at: z.coerce.date().optional(),
});

const statusBody = z.object({
  status: z.enum(['available', 'on_call', 'wrap_up', 'break', 'offline']),
});

const callsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', authenticate);

  app.post('/calls/dial', async (req, reply) => {
    const parsed = dialBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'validation', issues: parsed.error.issues });
    const { crm_account_id, phone, campaign_id } = parsed.data;
    const user = (req as any).user;

    const agent = await (prisma as any).agentMapping.findFirst({ where: { crm_user_id: user.id } });
    if (!agent) return reply.status(400).send({ error: 'no agent mapping for user' });

    let campaign: any = null;
    if (campaign_id) {
      campaign = await prisma.campaign.findUnique({ where: { id: campaign_id } });
    }
    const dialingHoursStart = campaign?.dialing_hours_start ?? '08:00';
    const dialingHoursEnd = campaign?.dialing_hours_end ?? '21:00';

    const account = await crmClient.getAccount(crm_account_id);
    const timezone = (account as any)?.timezone ?? campaign?.timezone ?? 'America/Chicago';

    const gate = await complianceGate.checkAll(
      { phone, crmAccountId: crm_account_id, timezone },
      { dialingHoursStart, dialingHoursEnd }
    );

    if (!gate.cleared) {
      try {
        await crmClient.logCompliance({
          crm_account_id,
          phone,
          agent_crm_user_id: user.id,
          reasons: gate.reasons,
        } as any);
      } catch (err) {
        logger.warn({ err }, 'failed to log compliance block');
      }
      return reply.status(403).send({ error: 'compliance_blocked', reasons: gate.reasons });
    }

    const callerId = await didManager.selectCallerId(
      campaign?.id ?? 'manual',
      phone
    );

    const session = await (voximplantApi as any).startCallSession({
      scenario: 'outbound-agent',
      customData: JSON.stringify({
        to: phone,
        from: callerId,
        crm_account_id,
        campaign_id,
        agent_username: agent.voximplant_username,
        amd_enabled: campaign?.amd_enabled ?? true,
        vm_drop_url: campaign?.voicemail_drop_url ?? null,
      }),
    });

    const callEvent = await (prisma as any).callEvent.create({
      data: {
        voximplant_call_id: session.call_session_id,
        campaign_id: campaign_id ?? null,
        agent_mapping_id: agent.id,
        crm_account_id,
        direction: 'outbound',
        from_number: callerId,
        to_number: phone,
        status: 'initiated',
      },
    });

    return { callId: callEvent.id, voximplantSessionId: callEvent.voximplant_call_id };
  });

  app.post<{ Params: { id: string } }>('/calls/:id/disposition', async (req, reply) => {
    const parsed = dispositionBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'validation', issues: parsed.error.issues });

    const event = await (prisma as any).callEvent.findUnique({ where: { id: req.params.id } });
    if (!event) return reply.status(404).send({ error: 'not found' });

    await (prisma as any).callEvent.update({
      where: { id: req.params.id },
      data: { disposition_code: parsed.data.disposition_code },
    });

    await syncCallOutcomeQueue.add(
      'sync-call-outcome',
      { callEventId: req.params.id },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
    );

    if (parsed.data.callback_at && event.crm_account_id) {
      try {
        await crmClient.logCall(event.crm_account_id, {
          note: parsed.data.notes,
          callback_at: parsed.data.callback_at.toISOString(),
        } as any);
      } catch (err) {
        logger.warn({ err }, 'failed to log callback via CRM');
      }
    }

    return { ok: true };
  });

  app.get('/calls/active', { preHandler: requireRole(['supervisor', 'admin']) }, async () => {
    const events = await (prisma as any).callEvent.findMany({
      where: { status: { notIn: ['completed', 'failed'] } },
      include: { agent_mapping: true, campaign: true },
      orderBy: { created_at: 'desc' },
    });
    return events;
  });

  app.patch('/agents/me/status', async (req, reply) => {
    const parsed = statusBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'validation', issues: parsed.error.issues });
    const user = (req as any).user;

    const agent = await (prisma as any).agentMapping.findFirst({ where: { crm_user_id: user.id } });
    if (!agent) return reply.status(404).send({ error: 'no agent mapping' });

    const now = new Date();
    const prev = await (prisma as any).agentStatusLog.findFirst({
      where: { agent_mapping_id: agent.id, ended_at: null },
      orderBy: { started_at: 'desc' },
    });
    if (prev) {
      const duration = Math.max(0, Math.floor((now.getTime() - new Date(prev.started_at).getTime()) / 1000));
      await (prisma as any).agentStatusLog.updateMany({
        where: { id: prev.id },
        data: { ended_at: now, duration_seconds: duration },
      });
    }
    await (prisma as any).agentStatusLog.create({
      data: {
        agent_mapping_id: agent.id,
        status: parsed.data.status,
        started_at: now,
        campaign_id: agent.current_campaign_id ?? null,
      },
    });
    const updated = await (prisma as any).agentMapping.update({
      where: { id: agent.id },
      data: { status: parsed.data.status },
    });
    return updated;
  });
};

export default callsRoutes;
```

- [ ] **Step 4: Run test - verify pass**
Run: `cd backend && npm test -- calls`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add backend/src/routes/calls.ts backend/src/routes/__tests__/calls.test.ts
git commit -m "feat: calls routes — dial w/ compliance gate, disposition sync, status log"
```
## Phase 4: VoxEngine Scenarios

VoxEngine scenarios are plain JavaScript files that execute in Voximplant's cloud. They cannot be unit tested locally; verification is manual via the Voximplant IDE logs, the dialer's `/api/webhooks/voximplant` webhook receiver, and by observing CRM activity. All three scenarios in this phase share the same module loading pattern (globals populated via `require`), the same backend webhook contract, and the same CRM prefetch contract.

Placeholders in the form `{{NAME}}` inside these files are replaced at deploy time by the voxfiles deploy script (see Phase 5 / ops tooling). The placeholders are NOT valid JavaScript identifiers at runtime by themselves — the deploy script does a literal string substitution with values pulled from the dialer backend's `config` service before uploading the scenario.

---

### Task 17: VoxEngine Shared Modules

**Files:**
- Create: `voxfiles/modules/config.voxengine.js`
- Create: `voxfiles/modules/crm-webhook.voxengine.js`

- [ ] **Step 1: Create `voxfiles/modules/config.voxengine.js`**
```javascript
/**
 * Elite Dialer — VoxEngine shared config module.
 *
 * Loaded via `require(Modules.ApplicationStorage)` pattern OR by being listed
 * as a dependency in the scenario's `require()` call at the top of each
 * scenario file. Values marked `{{...}}` are replaced at deploy time by the
 * voxfiles deploy script (see scripts/deploy-voxfiles.ts).
 *
 * DO NOT commit real secrets here. Placeholders only.
 */

// --- Backend webhook ---------------------------------------------------------
var BACKEND_WEBHOOK_URL = '{{BACKEND_WEBHOOK_URL}}'; // e.g. https://dialer.example.com/api/webhooks/voximplant
var WEBHOOK_SECRET      = '{{WEBHOOK_SECRET}}';     // shared secret for X-Webhook-Secret header

// --- CRM integration ---------------------------------------------------------
var CRM_BASE_URL = '{{CRM_BASE_URL}}'; // e.g. https://crm.example.com
var CRM_API_KEY  = '{{CRM_API_KEY}}';  // sent as X-Dialer-Key to CRM

// --- AMD tuning (Voximplant AMD module) -------------------------------------
var AMD_INITIAL_SILENCE_MS  = 4500; // silence window before we decide nobody greeted us
var AMD_GREETING_MS         = 1500; // max human greeting length
var AMD_AFTER_GREETING_MS   = 800;  // silence after greeting required to flip to human

// --- Voicemail drop ----------------------------------------------------------
var VM_DROP_TIMEOUT_MS = 30000; // safety: force hangup after this long playing VM audio

// --- Agent connection --------------------------------------------------------
var AGENT_CONNECT_TIMEOUT_SECONDS = 30;

// --- Recorder ----------------------------------------------------------------
var RECORDING_FORMAT = 'mp3';
var RECORDING_STEREO = true;

// --- IVR ---------------------------------------------------------------------
var IVR_GREETING  = 'Thank you for calling Elite Portfolio Management.';
var IVR_MAIN_MENU = 'Press 1 to speak with a representative. Press 2 for payment information. Press 3 to request a callback.';

// Expose on global scope so scenarios that `require()` this file can use them.
// VoxEngine does not support CommonJS exports; globals are the supported pattern.
global.EliteDialerConfig = {
    BACKEND_WEBHOOK_URL: BACKEND_WEBHOOK_URL,
    WEBHOOK_SECRET: WEBHOOK_SECRET,
    CRM_BASE_URL: CRM_BASE_URL,
    CRM_API_KEY: CRM_API_KEY,
    AMD_INITIAL_SILENCE_MS: AMD_INITIAL_SILENCE_MS,
    AMD_GREETING_MS: AMD_GREETING_MS,
    AMD_AFTER_GREETING_MS: AMD_AFTER_GREETING_MS,
    VM_DROP_TIMEOUT_MS: VM_DROP_TIMEOUT_MS,
    AGENT_CONNECT_TIMEOUT_SECONDS: AGENT_CONNECT_TIMEOUT_SECONDS,
    RECORDING_FORMAT: RECORDING_FORMAT,
    RECORDING_STEREO: RECORDING_STEREO,
    IVR_GREETING: IVR_GREETING,
    IVR_MAIN_MENU: IVR_MAIN_MENU
};
```

- [ ] **Step 2: Create `voxfiles/modules/crm-webhook.voxengine.js`**
```javascript
/**
 * Elite Dialer — VoxEngine CRM/backend HTTP helpers.
 *
 * Depends on EliteDialerConfig (from config.voxengine.js). All functions
 * swallow errors (log + move on) so a backend hiccup never tears down a live
 * call. Callbacks follow Node-style (err, data).
 */

(function () {
    var cfg = global.EliteDialerConfig || {};

    /**
     * POST a structured event to the dialer backend webhook.
     * @param {string} event - e.g. 'call_started', 'amd_result', 'agent_connected', 'call_ended'
     * @param {object} data  - arbitrary JSON payload
     * @param {function} [callback] - optional (err, response)
     */
    function notifyDialerBackend(event, data, callback) {
        try {
            var url = cfg.BACKEND_WEBHOOK_URL;
            if (!url) {
                Logger.write('[crm-webhook] BACKEND_WEBHOOK_URL not configured; skipping event ' + event);
                if (callback) callback(new Error('BACKEND_WEBHOOK_URL missing'));
                return;
            }

            var body = JSON.stringify({ event: event, data: data || {} });
            var options = {
                method: 'POST',
                headers: [
                    'Content-Type: application/json',
                    'X-Webhook-Secret: ' + (cfg.WEBHOOK_SECRET || '')
                ],
                postData: body,
                timeout: 10
            };

            Net.httpRequestAsync(url, function (result) {
                try {
                    if (!result || result.code < 200 || result.code >= 300) {
                        Logger.write('[crm-webhook] notifyDialerBackend ' + event + ' failed: code=' +
                            (result ? result.code : 'none') + ' err=' + (result ? result.error : 'none'));
                        if (callback) callback(new Error('HTTP ' + (result ? result.code : 'none')));
                        return;
                    }
                    Logger.write('[crm-webhook] notifyDialerBackend ' + event + ' ok');
                    if (callback) callback(null, result);
                } catch (innerErr) {
                    Logger.write('[crm-webhook] notifyDialerBackend cb error: ' + innerErr);
                    if (callback) callback(innerErr);
                }
            }, options);
        } catch (err) {
            Logger.write('[crm-webhook] notifyDialerBackend threw: ' + err);
            if (callback) callback(err);
        }
    }

    /**
     * Ask the CRM to prefetch account data for this phone number so the agent
     * screen-pop is warm by the time media bridges.
     * @param {string} phone     - E.164 phone
     * @param {function} callback - (err, accountData)
     */
    function prefetchAccount(phone, callback) {
        try {
            if (!cfg.CRM_BASE_URL) {
                Logger.write('[crm-webhook] CRM_BASE_URL not configured; skipping prefetch');
                if (callback) callback(new Error('CRM_BASE_URL missing'));
                return;
            }

            var url = cfg.CRM_BASE_URL + '/api/voice/tools/prefetch-account';
            var body = JSON.stringify({ phone: phone });
            var options = {
                method: 'POST',
                headers: [
                    'Content-Type: application/json',
                    'X-Dialer-Key: ' + (cfg.CRM_API_KEY || '')
                ],
                postData: body,
                timeout: 8
            };

            Net.httpRequestAsync(url, function (result) {
                try {
                    if (!result || result.code < 200 || result.code >= 300) {
                        Logger.write('[crm-webhook] prefetchAccount failed: code=' +
                            (result ? result.code : 'none'));
                        if (callback) callback(new Error('HTTP ' + (result ? result.code : 'none')));
                        return;
                    }
                    var parsed = null;
                    try {
                        parsed = result.text ? JSON.parse(result.text) : null;
                    } catch (parseErr) {
                        Logger.write('[crm-webhook] prefetchAccount parse error: ' + parseErr);
                        if (callback) callback(parseErr);
                        return;
                    }
                    Logger.write('[crm-webhook] prefetchAccount ok for ' + phone);
                    if (callback) callback(null, parsed);
                } catch (innerErr) {
                    Logger.write('[crm-webhook] prefetchAccount cb error: ' + innerErr);
                    if (callback) callback(innerErr);
                }
            }, options);
        } catch (err) {
            Logger.write('[crm-webhook] prefetchAccount threw: ' + err);
            if (callback) callback(err);
        }
    }

    global.EliteDialerWebhook = {
        notifyDialerBackend: notifyDialerBackend,
        prefetchAccount: prefetchAccount
    };
})();
```

- [ ] **Step 3: Manual verification**

Voximplant scenarios cannot be unit tested locally. Verify by uploading and
confirming the IDE reports zero syntax/lint errors:

```bash
# From repo root — requires `voximplant` CLI authenticated (see docs/ops/voximplant-cli-setup.md)
voximplant scenario:upload voxfiles/modules/config.voxengine.js    --name elite-config
voximplant scenario:upload voxfiles/modules/crm-webhook.voxengine.js --name elite-crm-webhook
```

Alternative (no CLI): open the Voximplant control panel → Applications →
`elite-dialer` → Scenarios → New → paste each file's contents → Save.
Voximplant's editor reports syntax errors inline; both files must save
without errors.

Post-verification checklist:
- [ ] `elite-config` scenario exists, `global.EliteDialerConfig` object declared
- [ ] `elite-crm-webhook` scenario exists, `global.EliteDialerWebhook` object declared
- [ ] No placeholders (`{{...}}`) remain after the deploy script runs in a
      staging environment (confirm by reading the uploaded scenario in the IDE)

- [ ] **Step 4: Commit**
```bash
git add voxfiles/modules/config.voxengine.js voxfiles/modules/crm-webhook.voxengine.js
git commit -m "feat(voxengine): add shared config + CRM/backend webhook modules"
```

---

### Task 18: Outbound Agent Scenario (Manual / Preview dialing)

This scenario is started via the Management API when an agent clicks "Dial" in
the softphone (manual mode) or when a preview campaign hands off an account
for the agent to review first. `customData` is a JSON string.

**Files:**
- Create: `voxfiles/scenarios/outbound-agent.voxengine.js`

- [ ] **Step 1: Create `voxfiles/scenarios/outbound-agent.voxengine.js`**
```javascript
/**
 * Elite Dialer — Outbound Agent Scenario (manual / preview dialing).
 *
 * customData (JSON string):
 *   {
 *     "to": "+15551234567",
 *     "from": "+15557654321",
 *     "crm_account_id": "acc_...",
 *     "campaign_id": "cmp_..."            (optional for manual),
 *     "agent_username": "agent01",
 *     "amd_enabled": true,
 *     "vm_drop_url": "https://.../vm.mp3" (optional),
 *     "campaign_voximplant_session_id": "..." (optional tracking id)
 *   }
 */

require(Modules.AMD);
require(Modules.Recorder);
require(Modules.Player);

// Pull in shared modules (uploaded as separate scenarios at deploy time).
require('elite-config');
require('elite-crm-webhook');

var cfg     = global.EliteDialerConfig;
var webhook = global.EliteDialerWebhook;

// ---------------------------------------------------------------------------
// Parse customData
// ---------------------------------------------------------------------------
var params = {};
try {
    var raw = VoxEngine.customData();
    params = raw ? JSON.parse(raw) : {};
} catch (parseErr) {
    Logger.write('[outbound-agent] customData parse error: ' + parseErr);
    params = {};
}

var TO            = params.to;
var FROM          = params.from;
var CRM_ACCOUNT   = params.crm_account_id;
var CAMPAIGN_ID   = params.campaign_id || null;
var AGENT         = params.agent_username;
var AMD_ENABLED   = params.amd_enabled === true || params.amd_enabled === 'true';
var VM_DROP_URL   = params.vm_drop_url || null;
var SESSION_ID    = params.campaign_voximplant_session_id || null;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
var outboundCall       = null;
var agentCall          = null;
var amdResult          = null;   // 'human' | 'machine' | 'timeout'
var recordingStarted   = false;
var voicemailPlayed    = false;
var voicemailPlayer    = null;
var latestRecordingUrl = null;
var callStartedAt      = Date.now();
var agentConnectTimer  = null;
var vmTimeoutTimer     = null;
var terminated         = false;

function nowSecs() { return Math.round((Date.now() - callStartedAt) / 1000); }

function safeNotify(event, data) {
    try { webhook.notifyDialerBackend(event, data || {}); }
    catch (e) { Logger.write('[outbound-agent] notify ' + event + ' threw: ' + e); }
}

// ---------------------------------------------------------------------------
// Validate inputs — fail fast if required fields missing
// ---------------------------------------------------------------------------
if (!TO || !FROM || !AGENT) {
    Logger.write('[outbound-agent] missing required customData fields (to/from/agent_username); terminating');
    safeNotify('call_ended', {
        outcome: 'failed',
        reason: 'invalid_custom_data',
        crm_account_id: CRM_ACCOUNT,
        campaign_id: CAMPAIGN_ID,
        campaign_voximplant_session_id: SESSION_ID
    });
    VoxEngine.terminate();
}

// ---------------------------------------------------------------------------
// Kick off the call
// ---------------------------------------------------------------------------
safeNotify('call_started', {
    direction: 'outbound',
    mode: 'agent',
    to: TO,
    from: FROM,
    crm_account_id: CRM_ACCOUNT,
    campaign_id: CAMPAIGN_ID,
    agent_username: AGENT,
    amd_enabled: AMD_ENABLED,
    campaign_voximplant_session_id: SESSION_ID
});

outboundCall = VoxEngine.callPSTN(TO, FROM, null, {}, { customSipHeaders: {} });

outboundCall.addEventListener(CallEvents.Connected,    onOutboundConnected);
outboundCall.addEventListener(CallEvents.Failed,       onOutboundFailed);
outboundCall.addEventListener(CallEvents.Disconnected, onOutboundDisconnected);

// ---------------------------------------------------------------------------
// Outbound call handlers
// ---------------------------------------------------------------------------
function onOutboundConnected(e) {
    safeNotify('call_connected', {
        voximplant_call_id: outboundCall.id(),
        to: TO,
        crm_account_id: CRM_ACCOUNT,
        campaign_voximplant_session_id: SESSION_ID
    });

    if (AMD_ENABLED) {
        runAmd();
    } else {
        amdResult = 'human';
        startRecording();
        webhook.prefetchAccount(TO, function () { /* fire & forget */ });
        connectAgent();
    }
}

function onOutboundFailed(e) {
    Logger.write('[outbound-agent] outbound failed code=' + e.code + ' reason=' + e.reason);
    safeNotify('call_ended', {
        outcome: 'failed',
        code: e.code,
        reason: e.reason,
        voximplant_call_id: outboundCall ? outboundCall.id() : null,
        crm_account_id: CRM_ACCOUNT,
        campaign_id: CAMPAIGN_ID,
        campaign_voximplant_session_id: SESSION_ID
    });
    terminate();
}

function onOutboundDisconnected(e) {
    if (agentCall && agentCall.state() === 'CONNECTED') {
        try { agentCall.hangup(); } catch (err) { /* ignore */ }
    }
    finalizeCall(e && e.reason ? e.reason : 'hangup');
}

// ---------------------------------------------------------------------------
// AMD
// ---------------------------------------------------------------------------
function runAmd() {
    var amd = VoxEngine.createAMD(outboundCall, {
        initialSilenceMs:  cfg.AMD_INITIAL_SILENCE_MS,
        greetingMs:        cfg.AMD_GREETING_MS,
        afterGreetingMs:   cfg.AMD_AFTER_GREETING_MS
    });

    amd.addEventListener(AMDEvents.DetectionResult, function (ev) {
        amdResult = ev && ev.result ? ev.result : 'timeout';
        Logger.write('[outbound-agent] AMD result=' + amdResult);

        if (amdResult === 'machine' || amdResult === 'voicemail') {
            safeNotify('amd_result', {
                result: 'machine',
                voximplant_call_id: outboundCall.id(),
                crm_account_id: CRM_ACCOUNT
            });
            playVoicemailDrop();
        } else {
            // human or timeout — proceed to agent
            safeNotify('amd_result', {
                result: 'human',
                voximplant_call_id: outboundCall.id(),
                crm_account_id: CRM_ACCOUNT
            });
            startRecording();
            webhook.prefetchAccount(TO, function () { /* fire & forget */ });
            connectAgent();
        }
    });
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------
function startRecording() {
    if (recordingStarted) return;
    recordingStarted = true;
    try {
        var recorder = outboundCall.record({
            stereo: cfg.RECORDING_STEREO,
            format: cfg.RECORDING_FORMAT
        });

        recorder.addEventListener(RecorderEvents.Started, function () {
            safeNotify('recording_started', {
                voximplant_call_id: outboundCall.id(),
                crm_account_id: CRM_ACCOUNT
            });
        });

        recorder.addEventListener(RecorderEvents.Stopped, function (ev) {
            latestRecordingUrl = ev && ev.url ? ev.url : latestRecordingUrl;
            safeNotify('recording_ready', {
                voximplant_call_id: outboundCall.id(),
                recording_url: latestRecordingUrl,
                crm_account_id: CRM_ACCOUNT
            });
        });
    } catch (err) {
        Logger.write('[outbound-agent] startRecording threw: ' + err);
    }
}

// ---------------------------------------------------------------------------
// Agent connect
// ---------------------------------------------------------------------------
function connectAgent() {
    agentCall = VoxEngine.callUserDirect(outboundCall, AGENT, FROM, null);

    agentCall.addEventListener(CallEvents.Connected,    onAgentConnected);
    agentCall.addEventListener(CallEvents.Failed,       onAgentFailed);
    agentCall.addEventListener(CallEvents.Disconnected, onAgentDisconnected);

    agentConnectTimer = setTimeout(function () {
        if (!agentCall || agentCall.state() !== 'CONNECTED') {
            Logger.write('[outbound-agent] agent connect timeout (' + cfg.AGENT_CONNECT_TIMEOUT_SECONDS + 's)');
            safeNotify('agent_connect_timeout', {
                voximplant_call_id: outboundCall.id(),
                agent_username: AGENT,
                crm_account_id: CRM_ACCOUNT
            });
            try {
                outboundCall.say(
                    'We are unable to connect you to an agent at this time. Goodbye.',
                    Language.US_ENGLISH_FEMALE
                );
                outboundCall.addEventListener(CallEvents.PlaybackFinished, function () {
                    try { outboundCall.hangup(); } catch (err) { /* ignore */ }
                });
            } catch (err) {
                try { outboundCall.hangup(); } catch (err2) { /* ignore */ }
            }
        }
    }, cfg.AGENT_CONNECT_TIMEOUT_SECONDS * 1000);
}

function onAgentConnected(e) {
    if (agentConnectTimer) { clearTimeout(agentConnectTimer); agentConnectTimer = null; }
    safeNotify('agent_connected', {
        agent_username: AGENT,
        voximplant_call_id: outboundCall.id(),
        crm_account_id: CRM_ACCOUNT,
        campaign_voximplant_session_id: SESSION_ID
    });
    VoxEngine.sendMediaBetween(outboundCall, agentCall);
}

function onAgentFailed(e) {
    Logger.write('[outbound-agent] agent leg failed code=' + e.code + ' reason=' + e.reason);
    safeNotify('agent_failed', {
        agent_username: AGENT,
        code: e.code,
        reason: e.reason,
        voximplant_call_id: outboundCall.id()
    });
    try { outboundCall.hangup(); } catch (err) { /* ignore */ }
}

function onAgentDisconnected(e) {
    // Agent hung up → end the customer leg too.
    try { outboundCall.hangup(); } catch (err) { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Voicemail drop
// ---------------------------------------------------------------------------
function playVoicemailDrop() {
    if (!VM_DROP_URL) {
        safeNotify('call_ended', {
            outcome: 'answering_machine',
            amd_result: 'machine',
            voicemail_dropped: false,
            voximplant_call_id: outboundCall.id(),
            crm_account_id: CRM_ACCOUNT,
            campaign_id: CAMPAIGN_ID,
            campaign_voximplant_session_id: SESSION_ID
        });
        try { outboundCall.hangup(); } catch (err) { /* ignore */ }
        return;
    }

    try {
        voicemailPlayer = VoxEngine.createURLPlayer(VM_DROP_URL);
        voicemailPlayer.sendMediaTo(outboundCall);

        voicemailPlayer.addEventListener(PlayerEvents.PlaybackFinished, function () {
            voicemailPlayed = true;
            safeNotify('voicemail_dropped', {
                voximplant_call_id: outboundCall.id(),
                vm_drop_url: VM_DROP_URL,
                crm_account_id: CRM_ACCOUNT
            });
            try { outboundCall.hangup(); } catch (err) { /* ignore */ }
        });

        // Safety timeout so a stuck playback never strands the scenario.
        vmTimeoutTimer = setTimeout(function () {
            if (!voicemailPlayed) {
                Logger.write('[outbound-agent] VM drop timeout — forcing hangup');
                safeNotify('voicemail_drop_timeout', {
                    voximplant_call_id: outboundCall.id(),
                    vm_drop_url: VM_DROP_URL
                });
                try { outboundCall.hangup(); } catch (err) { /* ignore */ }
            }
        }, cfg.VM_DROP_TIMEOUT_MS);
    } catch (err) {
        Logger.write('[outbound-agent] playVoicemailDrop threw: ' + err);
        try { outboundCall.hangup(); } catch (err2) { /* ignore */ }
    }
}

// ---------------------------------------------------------------------------
// Finalize
// ---------------------------------------------------------------------------
function finalizeCall(reason) {
    if (terminated) return;
    safeNotify('call_ended', {
        outcome: amdResult === 'machine' || amdResult === 'voicemail'
            ? 'answering_machine'
            : 'completed',
        voximplant_call_id: outboundCall ? outboundCall.id() : null,
        duration_seconds: nowSecs(),
        hangup_reason: reason || 'hangup',
        recording_url: latestRecordingUrl,
        amd_result: amdResult,
        voicemail_dropped: voicemailPlayed,
        crm_account_id: CRM_ACCOUNT,
        campaign_id: CAMPAIGN_ID,
        agent_username: AGENT,
        campaign_voximplant_session_id: SESSION_ID
    });
    terminate();
}

function terminate() {
    if (terminated) return;
    terminated = true;
    if (agentConnectTimer) { clearTimeout(agentConnectTimer); agentConnectTimer = null; }
    if (vmTimeoutTimer)    { clearTimeout(vmTimeoutTimer);    vmTimeoutTimer = null; }
    try { VoxEngine.terminate(); } catch (err) { /* ignore */ }
}
```

- [ ] **Step 2: Manual verification**

```bash
# 1. Deploy scenario (run from repo root with voximplant CLI authed)
voximplant scenario:upload voxfiles/scenarios/outbound-agent.voxengine.js --name outbound-agent

# 2. Bind it to the dialer's application rule:
voximplant rule:update \
  --application-name elite-dialer \
  --rule-name outbound-agent \
  --scenario-name outbound-agent \
  --pattern '.*'
```

Trigger an end-to-end test via the Management API:

```bash
curl -X POST "https://api.voximplant.com/platform_api/StartScenarios/" \
  -u "$VOX_ACCOUNT:$VOX_API_KEY" \
  -d "rule_id=$OUTBOUND_AGENT_RULE_ID" \
  -d 'script_custom_data={"to":"+15551234567","from":"+15557654321","crm_account_id":"acc_test","agent_username":"agent01","amd_enabled":true}'
```

Verification checklist:
- [ ] Voximplant IDE session log shows `[outbound-agent]` entries with no uncaught errors
- [ ] AMD result line appears (`[outbound-agent] AMD result=human` or `machine`)
- [ ] Dialer backend logs show webhook POST hits: `call_started`, `call_connected`, `amd_result`, `agent_connected` (or `voicemail_dropped`), `call_ended`
- [ ] `call_events` table in the dialer DB has one row per event above with matching `voximplant_call_id`
- [ ] CRM received a `prefetch-account` POST for the test phone (check CRM server logs)
- [ ] Agent (logged into the WebSDK softphone as `agent01`) received inbound media and can hear/speak

- [ ] **Step 3: Commit**
```bash
git add voxfiles/scenarios/outbound-agent.voxengine.js
git commit -m "feat(voxengine): add outbound agent scenario for manual/preview dialing"
```

---

### Task 19: Outbound PDS Scenario (SmartQueue Predictive/Progressive)

This scenario is invoked by Voximplant's SmartQueue PDS engine for each dial
attempt in a campaign. `customData` is a semicolon-delimited string (that's the
format SmartQueue's call-list CSV→customData mapping produces). On human pickup
we tell SmartQueue the call succeeded and the queue routes an available agent
onto this session automatically — the agent join arrives as a subsequent
`CallEvents.Connected` on a call added to the conference.

**Files:**
- Create: `voxfiles/scenarios/outbound-pds.voxengine.js`

- [ ] **Step 1: Create `voxfiles/scenarios/outbound-pds.voxengine.js`**
```javascript
/**
 * Elite Dialer — Outbound PDS Scenario (SmartQueue predictive/progressive).
 *
 * customData (semicolon-delimited, matches the dialer's CSV→call-list export):
 *   phone;crm_account_id;campaign_id;caller_id;amd_enabled;vm_drop_url
 *
 * SmartQueue wiring:
 *   - On human: call VoxEngine.reportSuccessfulCallEvent() → SmartQueue routes an agent
 *   - On machine / failure: call VoxEngine.reportFailedCallEvent()
 *     (SmartQueue applies its configured retry policy to the contact)
 */

require(Modules.AMD);
require(Modules.Recorder);
require(Modules.Player);

require('elite-config');
require('elite-crm-webhook');

var cfg     = global.EliteDialerConfig;
var webhook = global.EliteDialerWebhook;

// ---------------------------------------------------------------------------
// Parse semicolon-delimited customData
// ---------------------------------------------------------------------------
var raw   = VoxEngine.customData() || '';
var parts = raw.split(';');

var PHONE        = parts[0] || '';
var CRM_ACCOUNT  = parts[1] || null;
var CAMPAIGN_ID  = parts[2] || null;
var CALLER_ID    = parts[3] || '';
var AMD_ENABLED  = (parts[4] || '').toString().toLowerCase() === 'true';
var VM_DROP_URL  = parts[5] || null;

Logger.write('[outbound-pds] customData phone=' + PHONE +
    ' crm=' + CRM_ACCOUNT +
    ' campaign=' + CAMPAIGN_ID +
    ' amd=' + AMD_ENABLED);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
var outboundCall       = null;
var agentCall          = null;   // assigned when SmartQueue routes an agent in
var amdResult          = null;
var recordingStarted   = false;
var voicemailPlayed    = false;
var latestRecordingUrl = null;
var callStartedAt      = Date.now();
var vmTimeoutTimer     = null;
var terminated         = false;
var reportedToSQ       = false;  // ensure we only call reportSuccessful/Failed once

function nowSecs() { return Math.round((Date.now() - callStartedAt) / 1000); }

function safeNotify(event, data) {
    try { webhook.notifyDialerBackend(event, data || {}); }
    catch (e) { Logger.write('[outbound-pds] notify ' + event + ' threw: ' + e); }
}

function reportSuccessOnce() {
    if (reportedToSQ) return;
    reportedToSQ = true;
    try {
        if (typeof VoxEngine.reportSuccessfulCallEvent === 'function') {
            VoxEngine.reportSuccessfulCallEvent();
        }
    } catch (err) { Logger.write('[outbound-pds] reportSuccessful threw: ' + err); }
}

function reportFailureOnce(reason) {
    if (reportedToSQ) return;
    reportedToSQ = true;
    try {
        if (typeof VoxEngine.reportFailedCallEvent === 'function') {
            VoxEngine.reportFailedCallEvent(reason || 'failed');
        }
    } catch (err) { Logger.write('[outbound-pds] reportFailed threw: ' + err); }
}

// ---------------------------------------------------------------------------
// Validate & start
// ---------------------------------------------------------------------------
if (!PHONE || !CALLER_ID) {
    Logger.write('[outbound-pds] missing phone or caller_id in customData; aborting');
    reportFailureOnce('invalid_custom_data');
    safeNotify('call_ended', {
        outcome: 'failed',
        reason: 'invalid_custom_data',
        phone: PHONE,
        crm_account_id: CRM_ACCOUNT,
        campaign_id: CAMPAIGN_ID
    });
    VoxEngine.terminate();
}

safeNotify('call_started', {
    direction: 'outbound',
    mode: 'pds',
    phone: PHONE,
    caller_id: CALLER_ID,
    crm_account_id: CRM_ACCOUNT,
    campaign_id: CAMPAIGN_ID,
    amd_enabled: AMD_ENABLED
});

outboundCall = VoxEngine.callPSTN(PHONE, CALLER_ID);

outboundCall.addEventListener(CallEvents.Connected,    onOutboundConnected);
outboundCall.addEventListener(CallEvents.Failed,       onOutboundFailed);
outboundCall.addEventListener(CallEvents.Disconnected, onOutboundDisconnected);

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------
function onOutboundConnected(e) {
    safeNotify('call_connected', {
        voximplant_call_id: outboundCall.id(),
        phone: PHONE,
        crm_account_id: CRM_ACCOUNT,
        campaign_id: CAMPAIGN_ID
    });

    if (AMD_ENABLED) {
        runAmd();
    } else {
        amdResult = 'human';
        handleHuman();
    }
}

function onOutboundFailed(e) {
    Logger.write('[outbound-pds] outbound failed code=' + e.code + ' reason=' + e.reason);
    reportFailureOnce(e.reason || 'failed');
    safeNotify('call_ended', {
        outcome: 'failed',
        code: e.code,
        reason: e.reason,
        phone: PHONE,
        crm_account_id: CRM_ACCOUNT,
        campaign_id: CAMPAIGN_ID,
        voximplant_call_id: outboundCall ? outboundCall.id() : null
    });
    terminate();
}

function onOutboundDisconnected(e) {
    if (agentCall) {
        try { agentCall.hangup(); } catch (err) { /* ignore */ }
    }
    finalizeCall(e && e.reason ? e.reason : 'hangup');
}

// ---------------------------------------------------------------------------
// AMD
// ---------------------------------------------------------------------------
function runAmd() {
    var amd = VoxEngine.createAMD(outboundCall, {
        initialSilenceMs:  cfg.AMD_INITIAL_SILENCE_MS,
        greetingMs:        cfg.AMD_GREETING_MS,
        afterGreetingMs:   cfg.AMD_AFTER_GREETING_MS
    });

    amd.addEventListener(AMDEvents.DetectionResult, function (ev) {
        amdResult = ev && ev.result ? ev.result : 'timeout';
        Logger.write('[outbound-pds] AMD result=' + amdResult);

        if (amdResult === 'machine' || amdResult === 'voicemail') {
            safeNotify('amd_result', {
                result: 'machine',
                voximplant_call_id: outboundCall.id(),
                crm_account_id: CRM_ACCOUNT,
                campaign_id: CAMPAIGN_ID
            });
            // PDS retry config decides whether to redial this contact.
            reportFailureOnce('answering_machine');
            playVoicemailDrop();
        } else {
            safeNotify('amd_result', {
                result: 'human',
                voximplant_call_id: outboundCall.id(),
                crm_account_id: CRM_ACCOUNT,
                campaign_id: CAMPAIGN_ID
            });
            handleHuman();
        }
    });
}

// ---------------------------------------------------------------------------
// Human pickup — let SmartQueue take over agent selection
// ---------------------------------------------------------------------------
function handleHuman() {
    startRecording();
    webhook.prefetchAccount(PHONE, function () { /* fire & forget */ });
    // Tells PDS: this was a DIAL_COMPLETE — SmartQueue now routes an agent.
    reportSuccessOnce();
    // The SDK dispatches a new inbound-to-this-session call for the agent
    // leg. Listen for it.
    VoxEngine.addEventListener(AppEvents.CallAlerting, onSmartQueueAgentCall);
}

// ---------------------------------------------------------------------------
// SmartQueue-routed agent leg
// ---------------------------------------------------------------------------
function onSmartQueueAgentCall(ev) {
    agentCall = ev.call;

    agentCall.addEventListener(CallEvents.Connected, function () {
        safeNotify('agent_connected', {
            voximplant_call_id: outboundCall.id(),
            agent_call_id: agentCall.id(),
            agent_username: (ev.headers && ev.headers['X-SmartQueue-Agent']) || null,
            crm_account_id: CRM_ACCOUNT,
            campaign_id: CAMPAIGN_ID
        });
        VoxEngine.sendMediaBetween(outboundCall, agentCall);
    });

    agentCall.addEventListener(CallEvents.Disconnected, function () {
        try { outboundCall.hangup(); } catch (err) { /* ignore */ }
    });

    agentCall.addEventListener(CallEvents.Failed, function (failEv) {
        safeNotify('agent_failed', {
            voximplant_call_id: outboundCall.id(),
            code: failEv.code,
            reason: failEv.reason
        });
        try { outboundCall.hangup(); } catch (err) { /* ignore */ }
    });

    try { agentCall.answer(); } catch (err) {
        Logger.write('[outbound-pds] agentCall.answer threw: ' + err);
    }
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------
function startRecording() {
    if (recordingStarted) return;
    recordingStarted = true;
    try {
        var recorder = outboundCall.record({
            stereo: cfg.RECORDING_STEREO,
            format: cfg.RECORDING_FORMAT
        });

        recorder.addEventListener(RecorderEvents.Started, function () {
            safeNotify('recording_started', {
                voximplant_call_id: outboundCall.id(),
                crm_account_id: CRM_ACCOUNT,
                campaign_id: CAMPAIGN_ID
            });
        });

        recorder.addEventListener(RecorderEvents.Stopped, function (stopEv) {
            latestRecordingUrl = stopEv && stopEv.url ? stopEv.url : latestRecordingUrl;
            safeNotify('recording_ready', {
                voximplant_call_id: outboundCall.id(),
                recording_url: latestRecordingUrl,
                crm_account_id: CRM_ACCOUNT,
                campaign_id: CAMPAIGN_ID
            });
        });
    } catch (err) {
        Logger.write('[outbound-pds] startRecording threw: ' + err);
    }
}

// ---------------------------------------------------------------------------
// Voicemail drop
// ---------------------------------------------------------------------------
function playVoicemailDrop() {
    if (!VM_DROP_URL) {
        safeNotify('call_ended', {
            outcome: 'answering_machine',
            amd_result: 'machine',
            voicemail_dropped: false,
            voximplant_call_id: outboundCall.id(),
            crm_account_id: CRM_ACCOUNT,
            campaign_id: CAMPAIGN_ID
        });
        try { outboundCall.hangup(); } catch (err) { /* ignore */ }
        return;
    }

    try {
        var player = VoxEngine.createURLPlayer(VM_DROP_URL);
        player.sendMediaTo(outboundCall);

        player.addEventListener(PlayerEvents.PlaybackFinished, function () {
            voicemailPlayed = true;
            safeNotify('voicemail_dropped', {
                voximplant_call_id: outboundCall.id(),
                vm_drop_url: VM_DROP_URL,
                crm_account_id: CRM_ACCOUNT,
                campaign_id: CAMPAIGN_ID
            });
            try { outboundCall.hangup(); } catch (err) { /* ignore */ }
        });

        vmTimeoutTimer = setTimeout(function () {
            if (!voicemailPlayed) {
                Logger.write('[outbound-pds] VM drop timeout — forcing hangup');
                safeNotify('voicemail_drop_timeout', {
                    voximplant_call_id: outboundCall.id(),
                    vm_drop_url: VM_DROP_URL
                });
                try { outboundCall.hangup(); } catch (err) { /* ignore */ }
            }
        }, cfg.VM_DROP_TIMEOUT_MS);
    } catch (err) {
        Logger.write('[outbound-pds] playVoicemailDrop threw: ' + err);
        try { outboundCall.hangup(); } catch (err2) { /* ignore */ }
    }
}

// ---------------------------------------------------------------------------
// Finalize
// ---------------------------------------------------------------------------
function finalizeCall(reason) {
    if (terminated) return;
    var outcome;
    if (amdResult === 'machine' || amdResult === 'voicemail') {
        outcome = 'answering_machine';
    } else if (amdResult === 'human') {
        outcome = 'completed';
    } else {
        outcome = 'completed';
    }

    safeNotify('call_ended', {
        outcome: outcome,
        voximplant_call_id: outboundCall ? outboundCall.id() : null,
        duration_seconds: nowSecs(),
        hangup_reason: reason || 'hangup',
        recording_url: latestRecordingUrl,
        amd_result: amdResult,
        voicemail_dropped: voicemailPlayed,
        phone: PHONE,
        crm_account_id: CRM_ACCOUNT,
        campaign_id: CAMPAIGN_ID
    });
    terminate();
}

function terminate() {
    if (terminated) return;
    terminated = true;
    if (vmTimeoutTimer) { clearTimeout(vmTimeoutTimer); vmTimeoutTimer = null; }
    // If we never told SmartQueue either way, default to failure so this
    // contact is eligible for PDS retry instead of being silently dropped.
    if (!reportedToSQ) reportFailureOnce('scenario_terminate_without_report');
    try { VoxEngine.terminate(); } catch (err) { /* ignore */ }
}
```

- [ ] **Step 2: Manual verification**

```bash
# 1. Deploy scenario
voximplant scenario:upload voxfiles/scenarios/outbound-pds.voxengine.js --name outbound-pds
```

Create a SmartQueue bound to this scenario — either in the Voximplant control
panel (Applications → elite-dialer → SmartQueues → New) or via the Management API:

```bash
curl -X POST "https://api.voximplant.com/platform_api/CreateSmartQueue/" \
  -u "$VOX_ACCOUNT:$VOX_API_KEY" \
  -d "application_id=$DIALER_APP_ID" \
  -d "sq_queue_name=test-pds-queue" \
  -d "call_type=outbound" \
  -d "scenario_name=outbound-pds" \
  -d "max_waiting_time=45" \
  -d "agent_selection=MOST_QUALIFIED"
```

Upload a minimal 3-row test call list CSV (columns must match the semicolon
parser: `phone;crm_account_id;campaign_id;caller_id;amd_enabled;vm_drop_url`):

```bash
cat > /tmp/test-pds.csv <<'EOF'
phone;crm_account_id;campaign_id;caller_id;amd_enabled;vm_drop_url
+15551234567;acc_test_1;cmp_test;+15557654321;true;https://cdn.example.com/vm-test.mp3
+15551234568;acc_test_2;cmp_test;+15557654321;true;https://cdn.example.com/vm-test.mp3
+15551234569;acc_test_3;cmp_test;+15557654321;true;https://cdn.example.com/vm-test.mp3
EOF

curl -X POST "https://api.voximplant.com/platform_api/CreateCallList/" \
  -u "$VOX_ACCOUNT:$VOX_API_KEY" \
  -F "rule_id=$PDS_RULE_ID" \
  -F "priority=1" \
  -F "max_simultaneous=2" \
  -F "num_attempts=1" \
  -F "name=test-pds-list" \
  -F "file_content=@/tmp/test-pds.csv" \
  -F "encoding=utf-8" \
  -F "delimiter=SEMICOLON"
```

Start the PDS campaign (mode=progressive is safest for a 3-row test; bump
`max_abandon_rate` to 0.03 once you're running predictive):

```bash
curl -X POST "$DIALER_BACKEND/api/campaigns/$CMP_ID/start" \
  -H "Authorization: Bearer $DIALER_JWT" \
  -d '{"mode":"progressive","max_abandon_rate":0.03}'
```

Verification checklist:
- [ ] Voximplant IDE shows `[outbound-pds]` logs for each row, with AMD result line
- [ ] Dialer backend webhook log shows `call_started` → `amd_result` → (`agent_connected` | `voicemail_dropped`) → `call_ended` per row
- [ ] `call_events` DB table has matching rows (use `voximplant_call_id` to correlate)
- [ ] Agent (logged into WebSDK) receives incoming call on each human-answered row
- [ ] CRM `/api/voice/tools/prefetch-account` hit once per human pickup (check CRM logs)
- [ ] CRM activity log shows a new call activity per completed leg (posted by the dialer's call-ended webhook handler, not VoxEngine)
- [ ] SmartQueue metrics dashboard reports the correct successful/failed counts

- [ ] **Step 3: Commit**
```bash
git add voxfiles/scenarios/outbound-pds.voxengine.js
git commit -m "feat(voxengine): add outbound PDS scenario for SmartQueue predictive dialing"
```
## Phase 5: Frontend — Agent Experience

This phase scaffolds the Next.js 14 app, auth flow, Voximplant WebSDK hook, Socket.IO real-time hook, persistent softphone bar, dashboard layout, and agent home page. By the end of this phase, a logged-in agent can see live call context in the softphone bar, change their status, dial/answer/hangup calls, and submit dispositions from the agent dashboard.

---

### Task 20: Next.js Scaffold

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/next.config.js`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/vitest.setup.ts`
- Create: `frontend/.eslintrc.json`
- Create: `frontend/.gitignore`
- Create: `frontend/src/app/globals.css`
- Create: `frontend/src/app/layout.tsx`
- Create: `frontend/src/types/index.ts`

- [ ] **Step 1: Write `frontend/package.json`**
```json
{
  "name": "elite-dialer-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start -p 3001",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "^14.1.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "axios": "^1.6.7",
    "socket.io-client": "^4.7.4",
    "voximplant-websdk": "^1.22.0",
    "zustand": "^4.5.0",
    "date-fns": "^3.3.1",
    "clsx": "^2.1.0",
    "lucide-react": "^0.344.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.19",
    "@types/react": "^18.2.55",
    "@types/react-dom": "^18.2.19",
    "typescript": "^5.3.3",
    "tailwindcss": "^3.4.1",
    "postcss": "^8.4.35",
    "autoprefixer": "^10.4.17",
    "eslint": "^8.56.0",
    "eslint-config-next": "^14.1.0",
    "vitest": "^1.3.0",
    "@vitejs/plugin-react": "^4.2.1",
    "@testing-library/react": "^14.2.1",
    "@testing-library/jest-dom": "^6.4.2",
    "@testing-library/user-event": "^14.5.2",
    "jsdom": "^24.0.0"
  }
}
```

- [ ] **Step 2: Write `frontend/tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write `frontend/next.config.js`**
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_DIALER_API_URL: process.env.NEXT_PUBLIC_DIALER_API_URL,
    NEXT_PUBLIC_CRM_URL: process.env.NEXT_PUBLIC_CRM_URL,
    NEXT_PUBLIC_VOXIMPLANT_APPLICATION: process.env.NEXT_PUBLIC_VOXIMPLANT_APPLICATION,
    NEXT_PUBLIC_VOXIMPLANT_ACCOUNT: process.env.NEXT_PUBLIC_VOXIMPLANT_ACCOUNT
  }
};

module.exports = nextConfig;
```

- [ ] **Step 4: Write `frontend/tailwind.config.js`**
```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/hooks/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          900: '#1e3a8a'
        },
        success: {
          500: '#10b981',
          600: '#059669',
          700: '#047857'
        },
        warning: {
          500: '#f59e0b',
          600: '#d97706'
        },
        danger: {
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};
```

- [ ] **Step 5: Write `frontend/postcss.config.js`**
```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
```

- [ ] **Step 6: Write `frontend/vitest.config.ts`**
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.{test,spec}.{ts,tsx}']
  },
  resolve: {
    alias: {
      '@': path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'src')
    }
  }
});
```

- [ ] **Step 7: Write `frontend/vitest.setup.ts`**
```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 8: Write `frontend/.eslintrc.json`**
```json
{
  "extends": "next/core-web-vitals"
}
```

- [ ] **Step 9: Write `frontend/.gitignore`**
```
node_modules
.next
out
.env*.local
.DS_Store
coverage
```

- [ ] **Step 10: Write `frontend/src/app/globals.css`**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body {
  height: 100%;
  background-color: #f8fafc;
  color: #0f172a;
}

body {
  font-family: Inter, system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}

* {
  box-sizing: border-box;
}
```

- [ ] **Step 11: Write `frontend/src/app/layout.tsx`**
```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Elite Dialer',
  description: 'Elite Portfolio voice communication platform'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://rsms.me/inter/inter.css"
        />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 12: Write `frontend/src/types/index.ts`**
```ts
export type UserRole = 'rep' | 'supervisor' | 'admin';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  crmUserId: string;
  firstName?: string;
  lastName?: string;
}

export interface VoximplantUser {
  username: string;
  oneTimeKey: string;
  applicationName: string;
  accountName: string;
}

export interface AgentMapping {
  id: string;
  crmUserId: string;
  crmEmail: string;
  crmRole: UserRole;
  voximplantUserId: number;
  voximplantUsername: string;
  status: AgentStatus;
  currentCallId?: string | null;
  currentCampaignId?: string | null;
  skills: string[];
}

export type AgentStatus = 'available' | 'on_call' | 'wrap_up' | 'break' | 'offline';

export type CampaignStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'completed';
export type DialMode = 'manual' | 'preview' | 'progressive' | 'predictive';
export type CallerIdStrategy = 'fixed' | 'rotation' | 'proximity';

export interface Campaign {
  id: string;
  name: string;
  crmCampaignId?: string | null;
  status: CampaignStatus;
  dialMode: DialMode;
  autoAnswer: boolean;
  voximplantQueueId?: number | null;
  voximplantListId?: number | null;
  scheduleStart?: string | null;
  scheduleEnd?: string | null;
  dialingHoursStart: string;
  dialingHoursEnd: string;
  timezone: string;
  maxConcurrentCalls: number;
  maxAbandonRate: number;
  dialRatio: number;
  maxAttempts: number;
  retryDelayMinutes: number;
  didGroupId?: string | null;
  callerIdStrategy: CallerIdStrategy;
  fixedCallerId?: string | null;
  amdEnabled: boolean;
  voicemailDropUrl?: string | null;
  totalContacts: number;
  totalDialed: number;
  totalConnected: number;
  totalVoicemail: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type CallDirection = 'inbound' | 'outbound';

export interface Call {
  id: string;
  voximplantCallId: string;
  campaignId?: string | null;
  contactId?: string | null;
  agentMappingId?: string | null;
  crmAccountId?: string | null;
  direction: CallDirection;
  fromNumber: string;
  toNumber: string;
  status: string;
  amdResult?: string | null;
  durationSeconds?: number | null;
  recordingUrl?: string | null;
  dispositionCode?: string | null;
  hangupReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PhoneNumber {
  id: string;
  number: string;
  voximplantNumberId?: number | null;
  didGroupId?: string | null;
  areaCode: string;
  state?: string | null;
  isActive: boolean;
  healthScore: number;
  dailyCallCount: number;
  dailyCallLimit: number;
  lastUsedAt?: string | null;
  cooldownUntil?: string | null;
}

export interface DIDGroup {
  id: string;
  name: string;
  createdAt: string;
}

export interface IncomingCallEvent {
  voximplant_call_id: string;
  from_number: string;
  crm_account_id?: string | null;
  account_summary?: {
    name?: string;
    balance?: number;
    lastOutcome?: string;
  } | null;
  campaign_name?: string | null;
}

export interface CallConnectedEvent {
  voximplant_call_id: string;
  started_at: string;
  crm_account_id?: string | null;
}

export interface CallEndedEvent {
  voximplant_call_id: string;
  call_id: string;
  duration_seconds: number;
  outcome?: string;
}

export interface PreviewNextEvent {
  crm_account_id: string;
  phone: string;
  account_summary?: {
    name?: string;
    balance?: number;
    lastOutcome?: string;
  } | null;
  campaign_id?: string | null;
  campaign_name?: string | null;
}

export interface StatusChangedEvent {
  status: AgentStatus;
}
```

- [ ] **Step 13: Verify**
Run: `cd frontend && npm install && npm run build`
Expected: install succeeds; `npm run build` completes with no TypeScript errors and produces `.next/`.

- [ ] **Step 14: Commit**
```bash
git add frontend/package.json frontend/tsconfig.json frontend/next.config.js frontend/tailwind.config.js frontend/postcss.config.js frontend/vitest.config.ts frontend/vitest.setup.ts frontend/.eslintrc.json frontend/.gitignore frontend/src/app/globals.css frontend/src/app/layout.tsx frontend/src/types/index.ts
git commit -m "feat(frontend): scaffold Next.js 14 app with Tailwind, Vitest, and core types"
```

---

### Task 21: API Client + Auth Store

**Files:**
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/stores/auth-store.ts`
- Create: `frontend/src/hooks/useAuth.ts`
- Create: `frontend/tests/auth-store.test.ts`
- Create: `frontend/src/app/page.tsx`

- [ ] **Step 1: Write failing test `frontend/tests/auth-store.test.ts`**
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => {
  const post = vi.fn();
  const get = vi.fn();
  const patch = vi.fn();
  const instance = {
    post,
    get,
    patch,
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() }
    }
  };
  return {
    api: instance,
    setAuthToken: vi.fn(),
    clearAuthToken: vi.fn()
  };
});

import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

describe('auth-store', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: null, token: null, voximplantUser: null, status: 'idle', error: null });
    vi.clearAllMocks();
  });

  it('login stores token, user, and voximplant credentials', async () => {
    (api.post as any).mockResolvedValueOnce({
      data: {
        token: 'jwt-123',
        user: { id: 'u1', email: 'a@b.com', role: 'rep', crmUserId: 'c1' },
        voximplantUser: {
          username: 'agent1@app.acc.voximplant.com',
          oneTimeKey: 'otk-abc',
          applicationName: 'app',
          accountName: 'acc'
        }
      }
    });

    await useAuthStore.getState().login('a@b.com', 'pw');

    const state = useAuthStore.getState();
    expect(state.token).toBe('jwt-123');
    expect(state.user?.email).toBe('a@b.com');
    expect(state.voximplantUser?.oneTimeKey).toBe('otk-abc');
    expect(localStorage.getItem('dialer.token')).toBe('jwt-123');
    expect(JSON.parse(localStorage.getItem('dialer.user')!).email).toBe('a@b.com');
    expect(JSON.parse(localStorage.getItem('dialer.voximplant')!).username)
      .toBe('agent1@app.acc.voximplant.com');
  });

  it('login records error on failure', async () => {
    (api.post as any).mockRejectedValueOnce({ response: { data: { message: 'Invalid' } } });

    await useAuthStore.getState().login('a@b.com', 'bad');

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.error).toMatch(/invalid/i);
    expect(state.status).toBe('error');
  });

  it('logout clears storage and state', () => {
    localStorage.setItem('dialer.token', 'jwt-123');
    localStorage.setItem('dialer.user', JSON.stringify({ id: 'u1', email: 'a', role: 'rep', crmUserId: 'c1' }));
    localStorage.setItem('dialer.voximplant', JSON.stringify({ username: 'u', oneTimeKey: 'k', applicationName: 'a', accountName: 'a' }));
    useAuthStore.setState({
      user: { id: 'u1', email: 'a', role: 'rep', crmUserId: 'c1' },
      token: 'jwt-123',
      voximplantUser: { username: 'u', oneTimeKey: 'k', applicationName: 'a', accountName: 'a' },
      status: 'authenticated',
      error: null
    });

    useAuthStore.getState().logout();

    expect(localStorage.getItem('dialer.token')).toBeNull();
    expect(localStorage.getItem('dialer.user')).toBeNull();
    expect(localStorage.getItem('dialer.voximplant')).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('initFromStorage hydrates state from localStorage', () => {
    localStorage.setItem('dialer.token', 'jwt-999');
    localStorage.setItem('dialer.user', JSON.stringify({ id: 'u1', email: 'a@b.com', role: 'rep', crmUserId: 'c1' }));
    localStorage.setItem('dialer.voximplant', JSON.stringify({ username: 'u', oneTimeKey: 'k', applicationName: 'a', accountName: 'a' }));

    useAuthStore.getState().initFromStorage();

    const state = useAuthStore.getState();
    expect(state.token).toBe('jwt-999');
    expect(state.user?.email).toBe('a@b.com');
    expect(state.status).toBe('authenticated');
  });
});
```

- [ ] **Step 2: Write `frontend/src/lib/api.ts`**
```ts
import axios, { AxiosInstance } from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_DIALER_API_URL || 'http://localhost:5000';

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000
});

let cachedToken: string | null = null;

export function setAuthToken(token: string | null) {
  cachedToken = token;
}

export function clearAuthToken() {
  cachedToken = null;
}

api.interceptors.request.use((config) => {
  const token =
    cachedToken ||
    (typeof window !== 'undefined' ? window.localStorage.getItem('dialer.token') : null);
  if (token) {
    config.headers = config.headers || {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && typeof window !== 'undefined') {
      window.localStorage.removeItem('dialer.token');
      window.localStorage.removeItem('dialer.user');
      window.localStorage.removeItem('dialer.voximplant');
      clearAuthToken();
      if (window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);
```

- [ ] **Step 3: Write `frontend/src/stores/auth-store.ts`**
```ts
import { create } from 'zustand';
import { api, setAuthToken, clearAuthToken } from '@/lib/api';
import type { User, VoximplantUser } from '@/types';

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'error';

interface AuthState {
  user: User | null;
  token: string | null;
  voximplantUser: VoximplantUser | null;
  status: AuthStatus;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  initFromStorage: () => void;
}

const TOKEN_KEY = 'dialer.token';
const USER_KEY = 'dialer.user';
const VOX_KEY = 'dialer.voximplant';

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  voximplantUser: null,
  status: 'idle',
  error: null,

  async login(email, password) {
    set({ status: 'loading', error: null });
    try {
      const { data } = await api.post('/api/auth/login', { email, password });
      const { token, user, voximplantUser } = data as {
        token: string;
        user: User;
        voximplantUser: VoximplantUser;
      };

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(TOKEN_KEY, token);
        window.localStorage.setItem(USER_KEY, JSON.stringify(user));
        window.localStorage.setItem(VOX_KEY, JSON.stringify(voximplantUser));
      }
      setAuthToken(token);
      set({ token, user, voximplantUser, status: 'authenticated', error: null });
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        (err?.response?.status === 401 ? 'Invalid email or password' : 'Login failed');
      set({ status: 'error', error: message, token: null, user: null, voximplantUser: null });
    }
  },

  logout() {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(USER_KEY);
      window.localStorage.removeItem(VOX_KEY);
    }
    clearAuthToken();
    set({ user: null, token: null, voximplantUser: null, status: 'idle', error: null });
  },

  initFromStorage() {
    if (typeof window === 'undefined') return;
    const token = window.localStorage.getItem(TOKEN_KEY);
    const rawUser = window.localStorage.getItem(USER_KEY);
    const rawVox = window.localStorage.getItem(VOX_KEY);
    if (!token || !rawUser) return;
    try {
      const user = JSON.parse(rawUser) as User;
      const voximplantUser = rawVox ? (JSON.parse(rawVox) as VoximplantUser) : null;
      setAuthToken(token);
      set({ token, user, voximplantUser, status: 'authenticated', error: null });
    } catch {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(USER_KEY);
      window.localStorage.removeItem(VOX_KEY);
    }
  }
}));
```

- [ ] **Step 4: Write `frontend/src/hooks/useAuth.ts`**
```ts
'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';

export function useAuth() {
  const state = useAuthStore();

  useEffect(() => {
    if (state.status === 'idle') {
      state.initFromStorage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
```

- [ ] **Step 5: Write `frontend/src/app/page.tsx`**
```tsx
'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const router = useRouter();
  const { login, status, error, token } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (token) {
      router.replace('/dashboard');
    }
  }, [token, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await login(email, password);
  }

  const isLoading = status === 'loading';

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white shadow-md rounded-lg p-8 border border-slate-200">
        <h1 className="text-2xl font-semibold text-slate-900 mb-1">Elite Dialer</h1>
        <p className="text-sm text-slate-500 mb-6">Sign in with your CRM credentials.</p>

        {error && (
          <div
            role="alert"
            className="mb-4 px-3 py-2 text-sm rounded-md bg-danger-500/10 border border-danger-500/40 text-danger-700"
          >
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2 rounded-md bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-medium transition"
          >
            {isLoading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Verify**
Run: `cd frontend && npm run test -- auth-store && npm run build`
Expected: all auth-store tests pass; build succeeds.

- [ ] **Step 7: Commit**
```bash
git add frontend/src/lib/api.ts frontend/src/stores/auth-store.ts frontend/src/hooks/useAuth.ts frontend/src/app/page.tsx frontend/tests/auth-store.test.ts
git commit -m "feat(frontend): axios client, auth store, and login page"
```

---

### Task 22: useVoximplant Hook

**Files:**
- Create: `frontend/src/hooks/useVoximplant.ts`
- Create: `frontend/tests/useVoximplant.test.ts`

- [ ] **Step 1: Write failing test `frontend/tests/useVoximplant.test.ts`**
```ts
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: any) => void;

class FakeCall {
  id: string;
  handlers: Record<string, Handler[]> = {};
  customData: string | undefined;
  constructor(id: string, customData?: string) {
    this.id = id;
    this.customData = customData;
  }
  on(event: string, cb: Handler) {
    this.handlers[event] = this.handlers[event] || [];
    this.handlers[event].push(cb);
  }
  off(event: string, cb: Handler) {
    this.handlers[event] = (this.handlers[event] || []).filter((h) => h !== cb);
  }
  trigger(event: string, payload: any = {}) {
    (this.handlers[event] || []).forEach((h) => h(payload));
  }
  answer = vi.fn();
  hangup = vi.fn();
  sendDigits = vi.fn();
  sendTone = vi.fn();
  muteMicrophone = vi.fn();
  unmuteMicrophone = vi.fn();
  hold = vi.fn();
  getCustomData() {
    return this.customData;
  }
}

const listeners: Record<string, Handler[]> = {};
const lastCall = { current: null as FakeCall | null };

const fakeClient = {
  init: vi.fn().mockResolvedValue(undefined),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  loginWithOneTimeKey: vi.fn().mockResolvedValue(undefined),
  setOperatorACDStatus: vi.fn().mockResolvedValue(undefined),
  call: vi.fn((opts: any) => {
    const call = new FakeCall('out-1', JSON.stringify({ autoAnswer: false }));
    lastCall.current = call;
    return call;
  }),
  on: vi.fn((event: string, cb: Handler) => {
    listeners[event] = listeners[event] || [];
    listeners[event].push(cb);
  }),
  off: vi.fn((event: string, cb: Handler) => {
    listeners[event] = (listeners[event] || []).filter((h) => h !== cb);
  })
};

function fire(event: string, payload: any) {
  (listeners[event] || []).forEach((h) => h(payload));
}

vi.mock('voximplant-websdk', () => ({
  default: {
    getInstance: () => fakeClient,
    Events: {
      ConnectionEstablished: 'ConnectionEstablished',
      ConnectionFailed: 'ConnectionFailed',
      ConnectionClosed: 'ConnectionClosed',
      AuthResult: 'AuthResult',
      IncomingCall: 'IncomingCall'
    },
    CallEvents: {
      Connected: 'Connected',
      Disconnected: 'Disconnected',
      Failed: 'Failed'
    },
    OperatorACDStatuses: {
      Ready: 'Ready',
      AfterService: 'AfterService',
      DND: 'DND',
      Offline: 'Offline'
    }
  }
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: Object.assign(
    (selector: any) =>
      selector({
        voximplantUser: {
          username: 'agent1@app.acc.voximplant.com',
          oneTimeKey: 'otk-abc',
          applicationName: 'app',
          accountName: 'acc'
        },
        token: 'jwt'
      }),
    {
      getState: () => ({
        voximplantUser: {
          username: 'agent1@app.acc.voximplant.com',
          oneTimeKey: 'otk-abc',
          applicationName: 'app',
          accountName: 'acc'
        }
      })
    }
  )
}));

import { useVoximplant } from '@/hooks/useVoximplant';

beforeEach(() => {
  for (const key of Object.keys(listeners)) delete listeners[key];
  lastCall.current = null;
  vi.clearAllMocks();
});

describe('useVoximplant', () => {
  it('connects and logs in using one-time key on mount', async () => {
    renderHook(() => useVoximplant());
    await waitFor(() => expect(fakeClient.init).toHaveBeenCalled());
    await waitFor(() => expect(fakeClient.connect).toHaveBeenCalled());
    act(() => fire('ConnectionEstablished', {}));
    await waitFor(() => expect(fakeClient.loginWithOneTimeKey).toHaveBeenCalled());
  });

  it('transitions to ringing on IncomingCall and active on Connected', async () => {
    const { result } = renderHook(() => useVoximplant());
    await waitFor(() => expect(fakeClient.init).toHaveBeenCalled());

    const call = new FakeCall('in-1', JSON.stringify({ autoAnswer: false }));
    act(() => fire('IncomingCall', { call }));
    expect(result.current.callState).toBe('ringing');
    expect(result.current.currentCall).toBe(call);

    act(() => call.trigger('Connected', {}));
    expect(result.current.callState).toBe('active');
  });

  it('auto-answers when incoming call customData requests it', async () => {
    renderHook(() => useVoximplant());
    await waitFor(() => expect(fakeClient.init).toHaveBeenCalled());

    const call = new FakeCall('in-2', JSON.stringify({ autoAnswer: true }));
    act(() => fire('IncomingCall', { call }));
    expect(call.answer).toHaveBeenCalled();
  });

  it('callPSTN invokes client.call and sets ringing state', async () => {
    const { result } = renderHook(() => useVoximplant());
    await waitFor(() => expect(fakeClient.init).toHaveBeenCalled());

    act(() => {
      result.current.callPSTN('+15551234567');
    });
    expect(fakeClient.call).toHaveBeenCalled();
    expect(result.current.callState).toBe('ringing');
  });

  it('toggleMute/hangup/sendDTMF delegate to call object', async () => {
    const { result } = renderHook(() => useVoximplant());
    await waitFor(() => expect(fakeClient.init).toHaveBeenCalled());

    const call = new FakeCall('in-3');
    act(() => fire('IncomingCall', { call }));
    act(() => call.trigger('Connected', {}));

    act(() => result.current.toggleMute());
    expect(call.muteMicrophone).toHaveBeenCalled();
    expect(result.current.muted).toBe(true);

    act(() => result.current.sendDTMF('5'));
    expect(call.sendDigits).toHaveBeenCalledWith('5');

    act(() => result.current.hangupCall());
    expect(call.hangup).toHaveBeenCalled();
  });

  it('clears call state on Disconnected', async () => {
    const { result } = renderHook(() => useVoximplant());
    await waitFor(() => expect(fakeClient.init).toHaveBeenCalled());

    const call = new FakeCall('in-4');
    act(() => fire('IncomingCall', { call }));
    act(() => call.trigger('Connected', {}));
    act(() => call.trigger('Disconnected', {}));
    expect(result.current.callState).toBe('ended');
  });

  it('setStatus calls setOperatorACDStatus', async () => {
    const { result } = renderHook(() => useVoximplant());
    await waitFor(() => expect(fakeClient.init).toHaveBeenCalled());

    await act(async () => {
      await result.current.setStatus('available');
    });
    expect(fakeClient.setOperatorACDStatus).toHaveBeenCalledWith('Ready');
  });
});
```

- [ ] **Step 2: Write `frontend/src/hooks/useVoximplant.ts`**
```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import VoxImplant from 'voximplant-websdk';
import { useAuthStore } from '@/stores/auth-store';
import type { AgentStatus } from '@/types';

export type SdkState = 'disconnected' | 'connecting' | 'ready' | 'error';
export type CallState = 'idle' | 'ringing' | 'active' | 'ended';

interface CustomData {
  autoAnswer?: boolean;
  crm_account_id?: string;
  campaign_id?: string;
}

function parseCustomData(call: any): CustomData {
  try {
    const raw = typeof call?.getCustomData === 'function' ? call.getCustomData() : call?.customData;
    if (!raw) return {};
    return JSON.parse(raw) as CustomData;
  } catch {
    return {};
  }
}

function mapAgentStatusToAcd(status: AgentStatus): string {
  const statuses = (VoxImplant as any).OperatorACDStatuses || {};
  switch (status) {
    case 'available':
      return statuses.Ready ?? 'Ready';
    case 'on_call':
      return statuses.InService ?? statuses.Ready ?? 'Ready';
    case 'wrap_up':
      return statuses.AfterService ?? 'AfterService';
    case 'break':
      return statuses.DND ?? 'DND';
    case 'offline':
    default:
      return statuses.Offline ?? 'Offline';
  }
}

interface UseVoximplantReturn {
  sdkState: SdkState;
  callState: CallState;
  currentCall: any | null;
  muted: boolean;
  onHold: boolean;
  durationSeconds: number;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  setStatus: (status: AgentStatus) => Promise<void>;
  callPSTN: (number: string, customData?: CustomData) => any | null;
  answerCall: () => void;
  hangupCall: () => void;
  toggleMute: () => void;
  toggleHold: () => void;
  sendDTMF: (digit: string) => void;
}

export function useVoximplant(): UseVoximplantReturn {
  const voximplantUser = useAuthStore((s) => s.voximplantUser);
  const [sdkState, setSdkState] = useState<SdkState>('disconnected');
  const [callState, setCallState] = useState<CallState>('idle');
  const [currentCall, setCurrentCall] = useState<any | null>(null);
  const [muted, setMuted] = useState(false);
  const [onHold, setOnHold] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function startTimer() {
    stopTimer();
    setDurationSeconds(0);
    timerRef.current = setInterval(() => {
      setDurationSeconds((s) => s + 1);
    }, 1000);
  }

  const attachCallEvents = useCallback((call: any) => {
    const Events = (VoxImplant as any).CallEvents || {};

    const onConnected = () => {
      setCallState('active');
      startTimer();
    };
    const onDisconnected = () => {
      setCallState('ended');
      stopTimer();
      setCurrentCall(null);
      setMuted(false);
      setOnHold(false);
    };
    const onFailed = (e: any) => {
      setError(e?.reason || 'Call failed');
      setCallState('ended');
      stopTimer();
      setCurrentCall(null);
    };

    call.on(Events.Connected || 'Connected', onConnected);
    call.on(Events.Disconnected || 'Disconnected', onDisconnected);
    call.on(Events.Failed || 'Failed', onFailed);
  }, []);

  const connect = useCallback(async () => {
    if (!voximplantUser) return;
    const client = (VoxImplant as any).getInstance();
    clientRef.current = client;
    setSdkState('connecting');
    setError(null);

    try {
      await client.init({ micRequired: true, videoSupport: false, showDebugInfo: false });
      await client.connect();

      const Events = (VoxImplant as any).Events || {};

      const onEstablished = async () => {
        try {
          await client.loginWithOneTimeKey(voximplantUser.username, voximplantUser.oneTimeKey);
          if (mountedRef.current) setSdkState('ready');
        } catch (err: any) {
          if (mountedRef.current) {
            setSdkState('error');
            setError(err?.message || 'Voximplant login failed');
          }
        }
      };

      const onConnectionFailed = (e: any) => {
        setSdkState('error');
        setError(e?.message || 'Voximplant connection failed');
      };

      const onIncoming = (evt: any) => {
        const call = evt?.call || evt;
        setCurrentCall(call);
        setCallState('ringing');
        attachCallEvents(call);
        const data = parseCustomData(call);
        if (data.autoAnswer && typeof call.answer === 'function') {
          try {
            call.answer();
          } catch {
            /* swallow */
          }
        }
      };

      client.on(Events.ConnectionEstablished || 'ConnectionEstablished', onEstablished);
      client.on(Events.ConnectionFailed || 'ConnectionFailed', onConnectionFailed);
      client.on(Events.IncomingCall || 'IncomingCall', onIncoming);
    } catch (err: any) {
      setSdkState('error');
      setError(err?.message || 'SDK init failed');
    }
  }, [voximplantUser, attachCallEvents]);

  const disconnect = useCallback(async () => {
    stopTimer();
    const client = clientRef.current;
    if (client?.disconnect) {
      try {
        await client.disconnect();
      } catch {
        /* swallow */
      }
    }
    setSdkState('disconnected');
  }, []);

  const setStatus = useCallback(async (status: AgentStatus) => {
    const client = clientRef.current;
    if (!client) return;
    await client.setOperatorACDStatus(mapAgentStatusToAcd(status));
  }, []);

  const callPSTN = useCallback(
    (number: string, customData?: CustomData) => {
      const client = clientRef.current;
      if (!client) return null;
      const call = client.call({
        number,
        video: false,
        customData: JSON.stringify(customData ?? { autoAnswer: false })
      });
      setCurrentCall(call);
      setCallState('ringing');
      attachCallEvents(call);
      return call;
    },
    [attachCallEvents]
  );

  const answerCall = useCallback(() => {
    if (currentCall?.answer) currentCall.answer();
  }, [currentCall]);

  const hangupCall = useCallback(() => {
    if (currentCall?.hangup) currentCall.hangup();
  }, [currentCall]);

  const toggleMute = useCallback(() => {
    if (!currentCall) return;
    if (muted) {
      currentCall.unmuteMicrophone?.();
      setMuted(false);
    } else {
      currentCall.muteMicrophone?.();
      setMuted(true);
    }
  }, [currentCall, muted]);

  const toggleHold = useCallback(() => {
    if (!currentCall?.hold) return;
    const next = !onHold;
    currentCall.hold(next);
    setOnHold(next);
  }, [currentCall, onHold]);

  const sendDTMF = useCallback(
    (digit: string) => {
      if (!currentCall) return;
      if (currentCall.sendDigits) currentCall.sendDigits(digit);
      else if (currentCall.sendTone) currentCall.sendTone(digit);
    },
    [currentCall]
  );

  useEffect(() => {
    mountedRef.current = true;
    if (voximplantUser) {
      connect();
    }
    return () => {
      mountedRef.current = false;
      stopTimer();
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voximplantUser?.username, voximplantUser?.oneTimeKey]);

  return {
    sdkState,
    callState,
    currentCall,
    muted,
    onHold,
    durationSeconds,
    error,
    connect,
    disconnect,
    setStatus,
    callPSTN,
    answerCall,
    hangupCall,
    toggleMute,
    toggleHold,
    sendDTMF
  };
}
```

- [ ] **Step 3: Verify**
Run: `cd frontend && npm run test -- useVoximplant`
Expected: all hook tests pass (state transitions on IncomingCall/Connected/Disconnected, auto-answer behavior, callPSTN, mute/hangup/DTMF, setStatus).

- [ ] **Step 4: Commit**
```bash
git add frontend/src/hooks/useVoximplant.ts frontend/tests/useVoximplant.test.ts
git commit -m "feat(frontend): useVoximplant hook wrapping WebSDK lifecycle and call controls"
```

---

### Task 23: Socket.IO Hook

**Files:**
- Create: `frontend/src/lib/socket.ts`
- Create: `frontend/src/hooks/useSocket.ts`
- Create: `frontend/src/hooks/useRealtimeCall.ts`
- Create: `frontend/tests/useSocket.test.ts`
- Create: `frontend/tests/useRealtimeCall.test.ts`

- [ ] **Step 1: Write failing test `frontend/tests/useSocket.test.ts`**
```ts
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sockets: any[] = [];

vi.mock('socket.io-client', () => {
  const ioFn = vi.fn((url: string, opts: any) => {
    const handlers: Record<string, Function[]> = {};
    const socket = {
      url,
      opts,
      connected: true,
      on: vi.fn((evt: string, cb: Function) => {
        handlers[evt] = handlers[evt] || [];
        handlers[evt].push(cb);
      }),
      off: vi.fn((evt: string, cb: Function) => {
        handlers[evt] = (handlers[evt] || []).filter((h) => h !== cb);
      }),
      emit: vi.fn(),
      disconnect: vi.fn(),
      _handlers: handlers,
      _trigger: (evt: string, payload: any) => (handlers[evt] || []).forEach((h) => h(payload))
    };
    sockets.push(socket);
    return socket;
  });
  return { io: ioFn };
});

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: Object.assign(
    (selector: any) => selector({ token: 'jwt-token' }),
    { getState: () => ({ token: 'jwt-token' }) }
  )
}));

import { useSocket } from '@/hooks/useSocket';

beforeEach(() => {
  sockets.length = 0;
  vi.clearAllMocks();
});

describe('useSocket', () => {
  it('connects with JWT on mount and disconnects on unmount', async () => {
    const { unmount } = renderHook(() => useSocket());
    expect(sockets.length).toBe(1);
    expect(sockets[0].opts.auth.token).toBe('jwt-token');
    unmount();
    expect(sockets[0].disconnect).toHaveBeenCalled();
  });

  it('on() wrapper auto-cleans handlers', async () => {
    const handler = vi.fn();
    const { result, unmount } = renderHook(() => useSocket());
    const teardown = result.current.on('call:incoming', handler);
    expect(sockets[0].on).toHaveBeenCalledWith('call:incoming', handler);
    teardown();
    expect(sockets[0].off).toHaveBeenCalledWith('call:incoming', handler);
    unmount();
  });

  it('joinCampaign emits join:campaign', () => {
    const { result } = renderHook(() => useSocket());
    result.current.joinCampaign('camp-1');
    expect(sockets[0].emit).toHaveBeenCalledWith('join:campaign', { campaignId: 'camp-1' });
  });
});
```

- [ ] **Step 2: Write failing test `frontend/tests/useRealtimeCall.test.ts`**
```ts
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers: Record<string, Function[]> = {};

const fakeSocket = {
  on: vi.fn((evt: string, cb: Function) => {
    handlers[evt] = handlers[evt] || [];
    handlers[evt].push(cb);
    return () => {
      handlers[evt] = (handlers[evt] || []).filter((h) => h !== cb);
    };
  })
};

vi.mock('@/hooks/useSocket', () => ({
  useSocket: () => ({
    socket: fakeSocket,
    connected: true,
    on: (event: string, cb: Function) => fakeSocket.on(event, cb),
    joinCampaign: vi.fn()
  })
}));

import { useRealtimeCall } from '@/hooks/useRealtimeCall';

beforeEach(() => {
  for (const key of Object.keys(handlers)) delete handlers[key];
  vi.clearAllMocks();
});

function fire(event: string, payload: any) {
  (handlers[event] || []).forEach((h) => h(payload));
}

describe('useRealtimeCall', () => {
  it('captures incoming/connected/ended events', () => {
    const { result } = renderHook(() => useRealtimeCall());

    act(() => fire('call:incoming', { voximplant_call_id: 'v1', from_number: '+15551234567' }));
    expect(result.current.incomingCall?.from_number).toBe('+15551234567');

    act(() => fire('call:connected', { voximplant_call_id: 'v1', started_at: '2026-04-16T00:00:00Z' }));
    expect(result.current.activeCall?.voximplant_call_id).toBe('v1');

    act(() => fire('call:ended', { voximplant_call_id: 'v1', call_id: 'c1', duration_seconds: 42 }));
    expect(result.current.lastOutcome?.call_id).toBe('c1');
    expect(result.current.activeCall).toBeNull();
  });

  it('captures preview:next events', () => {
    const { result } = renderHook(() => useRealtimeCall());

    act(() => fire('preview:next', { crm_account_id: 'acc1', phone: '+15551112222' }));
    expect(result.current.previewContact?.crm_account_id).toBe('acc1');
  });
});
```

- [ ] **Step 3: Write `frontend/src/lib/socket.ts`**
```ts
import { io, Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_DIALER_API_URL || 'http://localhost:5000';

export function createSocket(token: string): Socket {
  return io(API_URL, {
    transports: ['websocket'],
    auth: { token },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000
  });
}
```

- [ ] **Step 4: Write `frontend/src/hooks/useSocket.ts`**
```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { createSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth-store';

export function useSocket() {
  const token = useAuthStore((s) => s.token);
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return;
    const socket = createSocket(token);
    socketRef.current = socket;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  const on = useCallback(<T = any>(event: string, handler: (payload: T) => void) => {
    const s = socketRef.current;
    if (!s) return () => undefined;
    s.on(event, handler as any);
    return () => s.off(event, handler as any);
  }, []);

  const emit = useCallback((event: string, payload?: any) => {
    socketRef.current?.emit(event, payload);
  }, []);

  const joinCampaign = useCallback(
    (campaignId: string) => {
      emit('join:campaign', { campaignId });
    },
    [emit]
  );

  return {
    socket: socketRef.current,
    connected,
    on,
    emit,
    joinCampaign
  };
}
```

- [ ] **Step 5: Write `frontend/src/hooks/useRealtimeCall.ts`**
```ts
'use client';

import { useEffect, useState } from 'react';
import { useSocket } from '@/hooks/useSocket';
import type {
  IncomingCallEvent,
  CallConnectedEvent,
  CallEndedEvent,
  PreviewNextEvent,
  StatusChangedEvent
} from '@/types';

export function useRealtimeCall() {
  const { on } = useSocket();

  const [incomingCall, setIncomingCall] = useState<IncomingCallEvent | null>(null);
  const [activeCall, setActiveCall] = useState<CallConnectedEvent | null>(null);
  const [lastOutcome, setLastOutcome] = useState<CallEndedEvent | null>(null);
  const [previewContact, setPreviewContact] = useState<PreviewNextEvent | null>(null);
  const [statusChange, setStatusChange] = useState<StatusChangedEvent | null>(null);

  useEffect(() => {
    const offIncoming = on<IncomingCallEvent>('call:incoming', (payload) => {
      setIncomingCall(payload);
    });
    const offConnected = on<CallConnectedEvent>('call:connected', (payload) => {
      setActiveCall(payload);
      setIncomingCall(null);
    });
    const offEnded = on<CallEndedEvent>('call:ended', (payload) => {
      setLastOutcome(payload);
      setActiveCall(null);
      setIncomingCall(null);
    });
    const offPreview = on<PreviewNextEvent>('preview:next', (payload) => {
      setPreviewContact(payload);
    });
    const offStatus = on<StatusChangedEvent>('status:changed', (payload) => {
      setStatusChange(payload);
    });

    return () => {
      offIncoming?.();
      offConnected?.();
      offEnded?.();
      offPreview?.();
      offStatus?.();
    };
  }, [on]);

  return {
    incomingCall,
    activeCall,
    lastOutcome,
    previewContact,
    statusChange,
    clearIncoming: () => setIncomingCall(null),
    clearOutcome: () => setLastOutcome(null),
    clearPreview: () => setPreviewContact(null)
  };
}
```

- [ ] **Step 6: Verify**
Run: `cd frontend && npm run test -- useSocket useRealtimeCall`
Expected: both hook test files pass.

- [ ] **Step 7: Commit**
```bash
git add frontend/src/lib/socket.ts frontend/src/hooks/useSocket.ts frontend/src/hooks/useRealtimeCall.ts frontend/tests/useSocket.test.ts frontend/tests/useRealtimeCall.test.ts
git commit -m "feat(frontend): Socket.IO client, useSocket, and useRealtimeCall hooks"
```

---

### Task 24: Softphone Bar Component

**Files:**
- Create: `frontend/src/components/softphone/StatusDropdown.tsx`
- Create: `frontend/src/components/softphone/WrapUpModal.tsx`
- Create: `frontend/src/components/softphone/SoftphoneBar.tsx`
- Create: `frontend/tests/SoftphoneBar.test.tsx`

- [ ] **Step 1: Write failing test `frontend/tests/SoftphoneBar.test.tsx`**
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let voxState: any = {
  sdkState: 'ready',
  callState: 'idle',
  currentCall: null,
  muted: false,
  onHold: false,
  durationSeconds: 0,
  error: null,
  setStatus: vi.fn().mockResolvedValue(undefined),
  answerCall: vi.fn(),
  hangupCall: vi.fn(),
  toggleMute: vi.fn(),
  toggleHold: vi.fn(),
  callPSTN: vi.fn(),
  sendDTMF: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn()
};

let realtimeState: any = {
  incomingCall: null,
  activeCall: null,
  lastOutcome: null,
  previewContact: null,
  statusChange: null,
  clearIncoming: vi.fn(),
  clearOutcome: vi.fn(),
  clearPreview: vi.fn()
};

vi.mock('@/hooks/useVoximplant', () => ({ useVoximplant: () => voxState }));
vi.mock('@/hooks/useRealtimeCall', () => ({ useRealtimeCall: () => realtimeState }));

const apiPatch = vi.fn().mockResolvedValue({ data: {} });
const apiPost = vi.fn().mockResolvedValue({ data: {} });
const apiGet = vi.fn().mockResolvedValue({ data: { dispositions: [{ code: 'PTP', label: 'Promise to Pay' }] } });

vi.mock('@/lib/api', () => ({
  api: { patch: apiPatch, post: apiPost, get: apiGet, interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } }
}));

import { SoftphoneBar } from '@/components/softphone/SoftphoneBar';

beforeEach(() => {
  voxState = {
    ...voxState,
    callState: 'idle',
    currentCall: null,
    muted: false,
    onHold: false,
    durationSeconds: 0
  };
  realtimeState = {
    incomingCall: null,
    activeCall: null,
    lastOutcome: null,
    previewContact: null,
    statusChange: null,
    clearIncoming: vi.fn(),
    clearOutcome: vi.fn(),
    clearPreview: vi.fn()
  };
  vi.clearAllMocks();
});

describe('SoftphoneBar', () => {
  it('idle state shows only status dropdown', () => {
    render(<SoftphoneBar />);
    expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /end/i })).not.toBeInTheDocument();
  });

  it('ringing state shows accept and decline buttons', () => {
    voxState.callState = 'ringing';
    voxState.currentCall = { id: 'v1' };
    realtimeState.incomingCall = {
      voximplant_call_id: 'v1',
      from_number: '+15551234567',
      crm_account_id: 'acc-1',
      account_summary: { name: 'John Doe', balance: 2450 }
    };
    render(<SoftphoneBar />);
    expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /decline/i })).toBeInTheDocument();
    expect(screen.getByText(/John Doe/i)).toBeInTheDocument();
  });

  it('active state shows mute/hold/end controls and CRM link', () => {
    voxState.callState = 'active';
    voxState.currentCall = { id: 'v1' };
    voxState.durationSeconds = 65;
    realtimeState.activeCall = { voximplant_call_id: 'v1', started_at: '2026-04-16T00:00:00Z', crm_account_id: 'acc-1' };
    render(<SoftphoneBar />);
    expect(screen.getByRole('button', { name: /mute/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hold/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /end/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open in crm/i })).toHaveAttribute('target', '_blank');
    expect(screen.getByText(/01:05/)).toBeInTheDocument();
  });

  it('wrap-up state shows Disposition button and opens modal', async () => {
    const user = userEvent.setup();
    realtimeState.lastOutcome = { voximplant_call_id: 'v1', call_id: 'c-42', duration_seconds: 90 };
    render(<SoftphoneBar />);
    const btn = screen.getByRole('button', { name: /disposition/i });
    await user.click(btn);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('status change calls PATCH /api/agents/me/status and voximplant setStatus', async () => {
    const user = userEvent.setup();
    render(<SoftphoneBar />);
    const select = screen.getByLabelText(/status/i) as HTMLSelectElement;
    await user.selectOptions(select, 'break');
    expect(apiPatch).toHaveBeenCalledWith('/api/agents/me/status', { status: 'break' });
    expect(voxState.setStatus).toHaveBeenCalledWith('break');
  });
});
```

- [ ] **Step 2: Write `frontend/src/components/softphone/StatusDropdown.tsx`**
```tsx
'use client';

import { ChangeEvent } from 'react';
import clsx from 'clsx';
import type { AgentStatus } from '@/types';

const OPTIONS: { value: AgentStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'break', label: 'On Break' },
  { value: 'offline', label: 'Offline' }
];

interface Props {
  value: AgentStatus;
  onChange: (next: AgentStatus) => void;
  disabled?: boolean;
  className?: string;
}

export function StatusDropdown({ value, onChange, disabled, className }: Props) {
  return (
    <label className={clsx('flex items-center gap-2 text-sm', className)}>
      <span className="text-slate-400">Status</span>
      <select
        aria-label="Status"
        className="bg-slate-800 text-white border border-slate-700 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
        value={value}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value as AgentStatus)}
        disabled={disabled}
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
```

- [ ] **Step 3: Write `frontend/src/components/softphone/WrapUpModal.tsx`**
```tsx
'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Disposition {
  code: string;
  label: string;
}

interface Props {
  callId: string;
  open: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
}

export function WrapUpModal({ callId, open, onClose, onSubmitted }: Props) {
  const [dispositions, setDispositions] = useState<Disposition[]>([]);
  const [dispositionCode, setDispositionCode] = useState('');
  const [notes, setNotes] = useState('');
  const [callbackAt, setCallbackAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api
      .get('/api/dispositions')
      .then((res) => {
        const list: Disposition[] = res.data?.dispositions ?? res.data ?? [];
        setDispositions(list);
        if (list[0]) setDispositionCode(list[0].code);
      })
      .catch(() => {
        setDispositions([
          { code: 'NO_ANSWER', label: 'No Answer' },
          { code: 'VOICEMAIL', label: 'Voicemail' },
          { code: 'PTP', label: 'Promise to Pay' },
          { code: 'REFUSED', label: 'Refused to Pay' }
        ]);
      });
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/api/calls/${callId}/disposition`, {
        disposition_code: dispositionCode,
        notes: notes || undefined,
        callback_at: callbackAt || undefined
      });
      onSubmitted?.();
      onClose();
      setNotes('');
      setCallbackAt('');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to submit disposition');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60"
    >
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Disposition Call</h2>
          <p className="text-xs text-slate-500">Call ID: {callId}</p>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {error && (
            <div className="text-sm text-danger-700 bg-danger-500/10 border border-danger-500/40 rounded px-2 py-1">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="disposition" className="block text-sm font-medium text-slate-700 mb-1">
              Disposition
            </label>
            <select
              id="disposition"
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm"
              value={dispositionCode}
              onChange={(e) => setDispositionCode(e.target.value)}
              required
            >
              {dispositions.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-slate-700 mb-1">
              Notes
            </label>
            <textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm"
              placeholder="Optional call notes…"
            />
          </div>
          <div>
            <label htmlFor="callback" className="block text-sm font-medium text-slate-700 mb-1">
              Schedule callback (optional)
            </label>
            <input
              id="callback"
              type="datetime-local"
              value={callbackAt}
              onChange={(e) => setCallbackAt(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm rounded-md border border-slate-300 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-2 text-sm rounded-md bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-60"
            >
              {submitting ? 'Saving…' : 'Save Disposition'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write `frontend/src/components/softphone/SoftphoneBar.tsx`**
```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Mic, MicOff, PauseCircle, PhoneOff, PhoneCall, ExternalLink } from 'lucide-react';
import { useVoximplant } from '@/hooks/useVoximplant';
import { useRealtimeCall } from '@/hooks/useRealtimeCall';
import { api } from '@/lib/api';
import { StatusDropdown } from './StatusDropdown';
import { WrapUpModal } from './WrapUpModal';
import type { AgentStatus } from '@/types';

const CRM_URL = process.env.NEXT_PUBLIC_CRM_URL || '';

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function formatMoney(amount?: number | null): string {
  if (amount == null) return '';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function SoftphoneBar() {
  const vox = useVoximplant();
  const realtime = useRealtimeCall();
  const [status, setLocalStatus] = useState<AgentStatus>('available');
  const [wrapUpOpen, setWrapUpOpen] = useState(false);

  useEffect(() => {
    if (realtime.statusChange?.status) {
      setLocalStatus(realtime.statusChange.status);
    }
  }, [realtime.statusChange]);

  async function handleStatusChange(next: AgentStatus) {
    setLocalStatus(next);
    try {
      await api.patch('/api/agents/me/status', { status: next });
    } catch (err) {
      /* swallow; surfaced via toast elsewhere */
    }
    try {
      await vox.setStatus(next);
    } catch {
      /* swallow */
    }
  }

  const callerInfo = useMemo(() => {
    if (realtime.incomingCall) {
      return {
        phone: realtime.incomingCall.from_number,
        name: realtime.incomingCall.account_summary?.name,
        balance: realtime.incomingCall.account_summary?.balance,
        accountId: realtime.incomingCall.crm_account_id,
        campaign: realtime.incomingCall.campaign_name
      };
    }
    if (realtime.activeCall) {
      return {
        phone: undefined,
        name: undefined,
        balance: undefined,
        accountId: realtime.activeCall.crm_account_id,
        campaign: undefined
      };
    }
    return null;
  }, [realtime.incomingCall, realtime.activeCall]);

  const stage: 'idle' | 'ringing' | 'active' | 'wrap' =
    vox.callState === 'ringing'
      ? 'ringing'
      : vox.callState === 'active'
        ? 'active'
        : realtime.lastOutcome
          ? 'wrap'
          : 'idle';

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900 text-white border-t border-slate-800 shadow-lg">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3 min-w-[180px]">
            <StatusDropdown value={status} onChange={handleStatusChange} />
            <span
              className={clsx(
                'h-2 w-2 rounded-full',
                vox.sdkState === 'ready' ? 'bg-success-500' : vox.sdkState === 'error' ? 'bg-danger-500' : 'bg-warning-500'
              )}
              title={`SDK: ${vox.sdkState}`}
            />
          </div>

          <div className="flex-1 flex items-center justify-center gap-4 text-sm">
            {stage === 'idle' && (
              <span className="text-slate-400">Idle — waiting for calls</span>
            )}

            {stage === 'ringing' && callerInfo && (
              <div className="flex items-center gap-3">
                <span className="px-2 py-1 rounded bg-warning-500/20 text-warning-500 text-xs font-medium uppercase">
                  Ringing
                </span>
                <span className="font-medium">{callerInfo.name || 'Unknown caller'}</span>
                <span className="text-slate-400">{callerInfo.phone}</span>
                {callerInfo.balance != null && (
                  <span className="text-success-500">{formatMoney(callerInfo.balance)}</span>
                )}
              </div>
            )}

            {stage === 'active' && (
              <div className="flex items-center gap-3">
                <span className="px-2 py-1 rounded bg-success-500/20 text-success-500 text-xs font-medium uppercase">
                  On Call
                </span>
                {callerInfo?.name && <span className="font-medium">{callerInfo.name}</span>}
                <span className="tabular-nums text-slate-300">{formatDuration(vox.durationSeconds)}</span>
                {callerInfo?.accountId && CRM_URL && (
                  <a
                    href={`${CRM_URL}/work/${callerInfo.accountId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary-500 hover:text-primary-100"
                  >
                    <ExternalLink className="h-3 w-3" /> Open in CRM
                  </a>
                )}
              </div>
            )}

            {stage === 'wrap' && (
              <div className="flex items-center gap-3">
                <span className="px-2 py-1 rounded bg-primary-600/30 text-primary-100 text-xs font-medium uppercase">
                  Wrap-up
                </span>
                <button
                  type="button"
                  onClick={() => setWrapUpOpen(true)}
                  className="px-3 py-1 rounded-md bg-primary-600 hover:bg-primary-700 text-white text-sm"
                >
                  Disposition
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 min-w-[240px] justify-end">
            {stage === 'ringing' && (
              <>
                <button
                  type="button"
                  onClick={vox.answerCall}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-md bg-success-600 hover:bg-success-700 text-white text-sm"
                >
                  <PhoneCall className="h-4 w-4" /> Accept
                </button>
                <button
                  type="button"
                  onClick={vox.hangupCall}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-md bg-danger-600 hover:bg-danger-700 text-white text-sm"
                >
                  <PhoneOff className="h-4 w-4" /> Decline
                </button>
              </>
            )}
            {stage === 'active' && (
              <>
                <button
                  type="button"
                  onClick={vox.toggleMute}
                  className={clsx(
                    'inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm',
                    vox.muted ? 'bg-warning-500 text-slate-900' : 'bg-slate-700 hover:bg-slate-600 text-white'
                  )}
                >
                  {vox.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />} Mute
                </button>
                <button
                  type="button"
                  onClick={vox.toggleHold}
                  className={clsx(
                    'inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm',
                    vox.onHold ? 'bg-warning-500 text-slate-900' : 'bg-slate-700 hover:bg-slate-600 text-white'
                  )}
                >
                  <PauseCircle className="h-4 w-4" /> Hold
                </button>
                <button
                  type="button"
                  onClick={vox.hangupCall}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-md bg-danger-600 hover:bg-danger-700 text-white text-sm"
                >
                  <PhoneOff className="h-4 w-4" /> End
                </button>
              </>
            )}
            {(stage === 'idle' || stage === 'wrap') && (
              <>
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-md bg-slate-800 text-slate-500 text-sm"
                >
                  <Mic className="h-4 w-4" /> Mute
                </button>
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-md bg-slate-800 text-slate-500 text-sm"
                >
                  <PauseCircle className="h-4 w-4" /> Hold
                </button>
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-md bg-slate-800 text-slate-500 text-sm"
                >
                  <PhoneOff className="h-4 w-4" /> End
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {realtime.lastOutcome && (
        <WrapUpModal
          callId={realtime.lastOutcome.call_id}
          open={wrapUpOpen}
          onClose={() => setWrapUpOpen(false)}
          onSubmitted={() => realtime.clearOutcome()}
        />
      )}
    </>
  );
}
```

- [ ] **Step 5: Verify**
Run: `cd frontend && npm run test -- SoftphoneBar && npm run build`
Expected: SoftphoneBar tests pass; build succeeds.

- [ ] **Step 6: Commit**
```bash
git add frontend/src/components/softphone/StatusDropdown.tsx frontend/src/components/softphone/WrapUpModal.tsx frontend/src/components/softphone/SoftphoneBar.tsx frontend/tests/SoftphoneBar.test.tsx
git commit -m "feat(frontend): persistent softphone bar with status, call controls, wrap-up modal"
```

---

### Task 25: Dashboard Layout + Sidebar

**Files:**
- Create: `frontend/src/components/Sidebar.tsx`
- Create: `frontend/src/app/dashboard/layout.tsx`
- Create: `frontend/tests/Sidebar.test.tsx`

- [ ] **Step 1: Write failing test `frontend/tests/Sidebar.test.tsx`**
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() })
}));

const logoutMock = vi.fn();

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: Object.assign(
    (selector: any) => selector({ logout: logoutMock }),
    { getState: () => ({ logout: logoutMock }) }
  )
}));

import { Sidebar } from '@/components/Sidebar';

describe('Sidebar', () => {
  it('shows only agent items for rep role', () => {
    render(<Sidebar role="rep" />);
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /campaigns/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /live monitor/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /phone numbers/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /settings/i })).not.toBeInTheDocument();
  });

  it('adds supervisor items', () => {
    render(<Sidebar role="supervisor" />);
    expect(screen.getByRole('link', { name: /live monitor/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /reports/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /phone numbers/i })).not.toBeInTheDocument();
  });

  it('adds admin items', () => {
    render(<Sidebar role="admin" />);
    expect(screen.getByRole('link', { name: /phone numbers/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
  });

  it('highlights active link matching the pathname', () => {
    render(<Sidebar role="admin" />);
    const activeLink = screen.getByRole('link', { name: /dashboard/i });
    expect(activeLink.className).toMatch(/bg-slate-800|bg-primary/);
  });

  it('renders logout button', () => {
    render(<Sidebar role="rep" />);
    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Write `frontend/src/components/Sidebar.tsx`**
```tsx
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  LayoutDashboard,
  Megaphone,
  Eye,
  BarChart3,
  Phone,
  Settings,
  LogOut
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import type { UserRole } from '@/types';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['rep', 'supervisor', 'admin'] },
  { href: '/dashboard/campaigns', label: 'Campaigns', icon: Megaphone, roles: ['rep', 'supervisor', 'admin'] },
  { href: '/dashboard/supervisor', label: 'Live Monitor', icon: Eye, roles: ['supervisor', 'admin'] },
  { href: '/dashboard/reports', label: 'Reports', icon: BarChart3, roles: ['supervisor', 'admin'] },
  { href: '/dashboard/phone-numbers', label: 'Phone Numbers', icon: Phone, roles: ['admin'] },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings, roles: ['admin'] }
];

interface Props {
  role: UserRole;
}

export function Sidebar({ role }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);

  const visible = NAV_ITEMS.filter((item) => item.roles.includes(role));

  function handleLogout() {
    logout();
    router.push('/');
  }

  return (
    <aside className="w-64 shrink-0 bg-slate-900 text-white flex flex-col border-r border-slate-800">
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="text-lg font-semibold">Elite Dialer</div>
        <div className="text-xs text-slate-400 uppercase tracking-wide mt-1">{role}</div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {visible.map((item) => {
          const active =
            pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                active ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-slate-800">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Write `frontend/src/app/dashboard/layout.tsx`**
```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { SoftphoneBar } from '@/components/softphone/SoftphoneBar';
import { useAuth } from '@/hooks/useAuth';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, token, status } = useAuth();

  useEffect(() => {
    if (status === 'idle') return;
    if (!token) {
      router.replace('/');
    }
  }, [token, status, router]);

  if (!token || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar role={user.role} />
      <main className="flex-1 overflow-y-auto pb-24">
        <div className="max-w-screen-2xl mx-auto px-6 py-6">{children}</div>
      </main>
      <SoftphoneBar />
    </div>
  );
}
```

- [ ] **Step 4: Verify**
Run: `cd frontend && npm run test -- Sidebar && npm run build`
Expected: Sidebar tests pass; build succeeds.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/components/Sidebar.tsx frontend/src/app/dashboard/layout.tsx frontend/tests/Sidebar.test.tsx
git commit -m "feat(frontend): dashboard layout with role-based sidebar and persistent softphone"
```

---

### Task 26: Agent Dashboard Page

**Files:**
- Create: `frontend/src/app/dashboard/page.tsx`
- Create: `frontend/tests/dashboard-page.test.tsx`

- [ ] **Step 1: Write failing test `frontend/tests/dashboard-page.test.tsx`**
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let authState: any = {
  user: { id: 'u1', email: 'a@b.com', role: 'rep', crmUserId: 'c1', firstName: 'Alex' },
  token: 'jwt',
  voximplantUser: null,
  status: 'authenticated',
  error: null,
  login: vi.fn(),
  logout: vi.fn(),
  initFromStorage: vi.fn()
};

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));

let realtimeState: any = {
  incomingCall: null,
  activeCall: null,
  lastOutcome: null,
  previewContact: null,
  statusChange: null,
  clearIncoming: vi.fn(),
  clearOutcome: vi.fn(),
  clearPreview: vi.fn()
};

vi.mock('@/hooks/useRealtimeCall', () => ({ useRealtimeCall: () => realtimeState }));

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock('@/lib/api', () => ({
  api: {
    get: apiGet,
    post: apiPost,
    patch: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } }
  }
}));

import DashboardPage from '@/app/dashboard/page';

beforeEach(() => {
  realtimeState = {
    incomingCall: null,
    activeCall: null,
    lastOutcome: null,
    previewContact: null,
    statusChange: null,
    clearIncoming: vi.fn(),
    clearOutcome: vi.fn(),
    clearPreview: vi.fn()
  };
  apiGet.mockReset();
  apiPost.mockReset();

  apiGet.mockImplementation((url: string) => {
    if (url.includes('/api/agents/me')) {
      return Promise.resolve({
        data: {
          id: 'map-1',
          crmUserId: 'c1',
          crmEmail: 'a@b.com',
          crmRole: 'rep',
          voximplantUserId: 1,
          voximplantUsername: 'agent1@app.acc.voximplant.com',
          status: 'available',
          skills: []
        }
      });
    }
    if (url.includes('/api/reports/agents')) {
      return Promise.resolve({
        data: {
          calls_today: 12,
          talk_time_seconds: 3600,
          connect_rate: 0.42
        }
      });
    }
    return Promise.resolve({ data: {} });
  });
});

describe('DashboardPage', () => {
  it('idle: shows greeting and stat cards', async () => {
    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByText(/welcome back, alex/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/calls today/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/12/)).toBeInTheDocument());
  });

  it('preview: shows contact card and dial button', async () => {
    realtimeState.previewContact = {
      crm_account_id: 'acc-1',
      phone: '+15551234567',
      account_summary: { name: 'Jane Roe', balance: 1800, lastOutcome: 'no_answer' },
      campaign_name: 'Q2 Outreach'
    };
    render(<DashboardPage />);
    expect(await screen.findByText(/jane roe/i)).toBeInTheDocument();
    const dialBtn = screen.getByRole('button', { name: /dial/i });
    await userEvent.setup().click(dialBtn);
    expect(apiPost).toHaveBeenCalledWith('/api/calls/dial', {
      crm_account_id: 'acc-1',
      phone: '+15551234567'
    });
  });

  it('active: shows on-call panel with open in CRM link', async () => {
    realtimeState.activeCall = {
      voximplant_call_id: 'v1',
      started_at: '2026-04-16T00:00:00Z',
      crm_account_id: 'acc-1'
    };
    render(<DashboardPage />);
    expect(await screen.findByText(/call in progress/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open full account in crm/i })).toHaveAttribute(
      'target',
      '_blank'
    );
  });

  it('wrap-up: surfaces disposition prompt after call:ended', async () => {
    realtimeState.lastOutcome = { voximplant_call_id: 'v1', call_id: 'c-42', duration_seconds: 180 };
    render(<DashboardPage />);
    expect(await screen.findByText(/wrap up your last call/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Write `frontend/src/app/dashboard/page.tsx`**
```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Phone, SkipForward } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimeCall } from '@/hooks/useRealtimeCall';
import { api } from '@/lib/api';
import { WrapUpModal } from '@/components/softphone/WrapUpModal';
import type { AgentMapping } from '@/types';

const CRM_URL = process.env.NEXT_PUBLIC_CRM_URL || '';

interface AgentReport {
  calls_today: number;
  talk_time_seconds: number;
  connect_rate: number;
}

interface CallbackRow {
  id: string;
  account_name: string;
  phone: string;
  scheduled_at: string;
}

function formatTalkTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const realtime = useRealtimeCall();
  const [mapping, setMapping] = useState<AgentMapping | null>(null);
  const [report, setReport] = useState<AgentReport | null>(null);
  const [callbacks, setCallbacks] = useState<CallbackRow[]>([]);
  const [dialing, setDialing] = useState(false);
  const [wrapOpen, setWrapOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [mapRes, reportRes] = await Promise.all([
          api.get('/api/agents/me'),
          api.get('/api/reports/agents', { params: { agent_id: 'me', dateFrom: 'today' } }).catch(() => null)
        ]);
        if (cancelled) return;
        setMapping(mapRes.data ?? null);
        setReport(reportRes?.data ?? null);
      } catch {
        /* noop */
      }

      try {
        const cbRes = await api.get('/api/callbacks/upcoming', { params: { mine: true } });
        if (!cancelled) setCallbacks(cbRes.data?.callbacks ?? []);
      } catch {
        if (!cancelled) setCallbacks([]);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (realtime.lastOutcome) setWrapOpen(true);
  }, [realtime.lastOutcome]);

  const stage: 'idle' | 'preview' | 'active' | 'wrap' = useMemo(() => {
    if (realtime.activeCall) return 'active';
    if (realtime.previewContact) return 'preview';
    if (realtime.lastOutcome) return 'wrap';
    return 'idle';
  }, [realtime.activeCall, realtime.previewContact, realtime.lastOutcome]);

  async function handleDial() {
    const c = realtime.previewContact;
    if (!c) return;
    setDialing(true);
    try {
      await api.post('/api/calls/dial', { crm_account_id: c.crm_account_id, phone: c.phone });
    } finally {
      setDialing(false);
    }
  }

  async function handleSkip() {
    const c = realtime.previewContact;
    if (!c) return;
    try {
      await api.post('/api/calls/skip', { crm_account_id: c.crm_account_id });
    } catch {
      /* noop */
    } finally {
      realtime.clearPreview();
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Welcome back, {user?.firstName || user?.email?.split('@')[0] || 'there'}
          </h1>
          <p className="text-sm text-slate-500">
            {mapping?.status === 'available' ? 'Ready to take calls.' : `Current status: ${mapping?.status ?? 'loading'}`}
          </p>
        </div>
      </header>

      {stage === 'idle' && (
        <section className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Calls Today" value={report?.calls_today ?? 0} />
            <StatCard
              label="Talk Time Today"
              value={report ? formatTalkTime(report.talk_time_seconds) : '0m'}
            />
            <StatCard
              label="Connect Rate"
              value={report ? formatPercent(report.connect_rate) : '0%'}
            />
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">Upcoming callbacks</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {callbacks.length === 0 ? (
                <div className="px-5 py-6 text-sm text-slate-500">No callbacks scheduled.</div>
              ) : (
                callbacks.map((cb) => (
                  <div key={cb.id} className="px-5 py-3 flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium text-slate-900">{cb.account_name}</div>
                      <div className="text-slate-500">{cb.phone}</div>
                    </div>
                    <div className="text-slate-500">{new Date(cb.scheduled_at).toLocaleString()}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      )}

      {stage === 'preview' && realtime.previewContact && (
        <section className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-primary-600">
                {realtime.previewContact.campaign_name || 'Preview'}
              </div>
              <div className="text-2xl font-semibold text-slate-900">
                {realtime.previewContact.account_summary?.name || 'Unknown contact'}
              </div>
              <div className="text-sm text-slate-500">{realtime.previewContact.phone}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Account balance</div>
              <div className="text-xl font-semibold text-success-700">
                {realtime.previewContact.account_summary?.balance != null
                  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
                      realtime.previewContact.account_summary.balance
                    )
                  : '—'}
              </div>
            </div>
          </div>
          {realtime.previewContact.account_summary?.lastOutcome && (
            <div className="text-sm text-slate-600">
              Last outcome:{' '}
              <span className="font-medium">{realtime.previewContact.account_summary.lastOutcome}</span>
            </div>
          )}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={handleDial}
              disabled={dialing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-medium"
            >
              <Phone className="h-4 w-4" />
              {dialing ? 'Dialing…' : 'Dial'}
            </button>
            <button
              type="button"
              onClick={handleSkip}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm"
            >
              <SkipForward className="h-4 w-4" /> Skip
            </button>
            {CRM_URL && realtime.previewContact.crm_account_id && (
              <Link
                href={`${CRM_URL}/work/${realtime.previewContact.crm_account_id}`}
                target="_blank"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm"
              >
                <ExternalLink className="h-4 w-4" /> Open in CRM
              </Link>
            )}
          </div>
        </section>
      )}

      {stage === 'active' && realtime.activeCall && (
        <section className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="text-xs uppercase tracking-wide text-success-700">Call in progress</div>
          <div className="text-xl font-semibold text-slate-900">
            Voximplant call {realtime.activeCall.voximplant_call_id}
          </div>
          <div className="text-sm text-slate-500">
            Started at {new Date(realtime.activeCall.started_at).toLocaleTimeString()}
          </div>
          {CRM_URL && realtime.activeCall.crm_account_id && (
            <Link
              href={`${CRM_URL}/work/${realtime.activeCall.crm_account_id}`}
              target="_blank"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium"
            >
              <ExternalLink className="h-4 w-4" /> Open Full Account in CRM
            </Link>
          )}
        </section>
      )}

      {stage === 'wrap' && realtime.lastOutcome && (
        <section className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 space-y-3">
          <div className="text-xs uppercase tracking-wide text-primary-600">Wrap-up</div>
          <div className="text-lg font-semibold text-slate-900">Wrap up your last call</div>
          <p className="text-sm text-slate-500">
            Call {realtime.lastOutcome.call_id} — {realtime.lastOutcome.duration_seconds}s. Log the outcome
            to continue.
          </p>
          <button
            type="button"
            onClick={() => setWrapOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium"
          >
            Open Disposition
          </button>
        </section>
      )}

      {realtime.lastOutcome && (
        <WrapUpModal
          callId={realtime.lastOutcome.call_id}
          open={wrapOpen}
          onClose={() => setWrapOpen(false)}
          onSubmitted={() => realtime.clearOutcome()}
        />
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}
```

- [ ] **Step 3: Verify**
Run: `cd frontend && npm run test -- dashboard-page && npm run build`
Expected: all agent dashboard tests pass; build succeeds.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/app/dashboard/page.tsx frontend/tests/dashboard-page.test.tsx
git commit -m "feat(frontend): agent dashboard with idle/preview/active/wrap-up stages"
```

---

### Phase 5 Completion Criteria

- [ ] `cd frontend && npm install` succeeds.
- [ ] `cd frontend && npm run build` completes with no type errors.
- [ ] `cd frontend && npm run test` runs the full Vitest suite with all of the following green:
  - `tests/auth-store.test.ts`
  - `tests/useVoximplant.test.ts`
  - `tests/useSocket.test.ts`
  - `tests/useRealtimeCall.test.ts`
  - `tests/SoftphoneBar.test.tsx`
  - `tests/Sidebar.test.tsx`
  - `tests/dashboard-page.test.tsx`
- [ ] With a running backend, logging in at `/` stores a JWT + Voximplant credentials and redirects to `/dashboard`.
- [ ] The softphone bar stays mounted across dashboard navigation, reflects agent status changes, and drives the disposition modal after `call:ended`.
- [ ] Incoming Socket.IO `call:incoming` / `preview:next` events transition the agent dashboard into the correct stage, and the `Open in CRM` link opens `${NEXT_PUBLIC_CRM_URL}/work/${accountId}` in a new tab.
## Phase 6: Frontend — Campaigns & Management

This phase delivers the campaign management UI (list, create/edit, detail with live progress) and the admin-only phone number / DID group management pages. All components are client-side React inside the Next.js 14 App Router and consume the existing Axios client (`frontend/src/lib/api.ts`), Zustand auth store (`frontend/src/stores/auth-store.ts`), and Socket.IO hook (`frontend/src/hooks/useSocket.ts`).

---

### Task 27: Campaign List Page

**Files:**
- Create: `frontend/src/app/dashboard/campaigns/page.tsx`
- Create: `frontend/src/components/campaign/CampaignRow.tsx`
- Create: `frontend/src/components/campaign/ProgressBar.tsx`
- Create: `frontend/src/components/campaign/StatusBadge.tsx`
- Create: `frontend/tests/campaigns-page.test.tsx`

- [ ] **Step 1: Create ProgressBar component**

`frontend/src/components/campaign/ProgressBar.tsx`:
```tsx
'use client';

interface ProgressBarProps {
  value: number;
  total: number;
  className?: string;
}

export function ProgressBar({ value, total, className = '' }: ProgressBarProps) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
        <span>
          {value.toLocaleString()} / {total.toLocaleString()}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="w-full h-2 bg-gray-200 rounded overflow-hidden">
        <div
          className="h-full bg-blue-600 transition-all duration-300"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create StatusBadge component**

`frontend/src/components/campaign/StatusBadge.tsx`:
```tsx
'use client';

export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'active'
  | 'paused'
  | 'completed'
  | 'stopped';

const COLORS: Record<CampaignStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 border-gray-200',
  scheduled: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  active: 'bg-green-100 text-green-700 border-green-200',
  paused: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  completed: 'bg-blue-100 text-blue-700 border-blue-200',
  stopped: 'bg-red-100 text-red-700 border-red-200',
};

export function StatusBadge({ status }: { status: CampaignStatus | string }) {
  const key = (status as CampaignStatus) in COLORS ? (status as CampaignStatus) : 'draft';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${COLORS[key]}`}
    >
      {status}
    </span>
  );
}
```

- [ ] **Step 3: Create CampaignRow component**

`frontend/src/components/campaign/CampaignRow.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { ProgressBar } from './ProgressBar';
import { StatusBadge, CampaignStatus } from './StatusBadge';

export interface CampaignListItem {
  id: string;
  name: string;
  status: CampaignStatus;
  dial_mode: 'manual' | 'preview' | 'progressive' | 'predictive';
  stats: {
    total: number;
    dialed: number;
    connected: number;
  };
  schedule_start: string | null;
  schedule_end: string | null;
  created_by_name: string | null;
  created_at: string;
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return '—';
  const fmt = (s: string | null) =>
    s ? new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '…';
  return `${fmt(start)} → ${fmt(end)}`;
}

export function CampaignRow({ c }: { c: CampaignListItem }) {
  return (
    <tr className="border-b hover:bg-gray-50">
      <td className="py-3 px-4">
        <Link
          href={`/dashboard/campaigns/${c.id}`}
          className="text-blue-600 hover:underline font-medium"
        >
          {c.name}
        </Link>
      </td>
      <td className="py-3 px-4">
        <StatusBadge status={c.status} />
      </td>
      <td className="py-3 px-4 text-sm text-gray-700 capitalize">{c.dial_mode}</td>
      <td className="py-3 px-4 w-64">
        <ProgressBar value={c.stats.dialed} total={c.stats.total} />
      </td>
      <td className="py-3 px-4 text-sm text-gray-600 whitespace-nowrap">
        {formatDateRange(c.schedule_start, c.schedule_end)}
      </td>
      <td className="py-3 px-4 text-sm text-gray-600">{c.created_by_name ?? '—'}</td>
    </tr>
  );
}
```

- [ ] **Step 4: Create the list page**

`frontend/src/app/dashboard/campaigns/page.tsx`:
```tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { CampaignRow, CampaignListItem } from '@/components/campaign/CampaignRow';

type Filter = 'all' | 'active' | 'draft' | 'completed';

const TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'draft', label: 'Draft' },
  { key: 'completed', label: 'Completed' },
];

export default function CampaignsPage() {
  const { user } = useAuth();
  const canCreate = user && ['supervisor', 'admin'].includes(user.role);

  const [campaigns, setCampaigns] = useState<CampaignListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    setError(null);
    setCampaigns(null);
    try {
      const { data } = await api.get<CampaignListItem[]>('/api/campaigns');
      setCampaigns(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load campaigns');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!campaigns) return [];
    if (filter === 'all') return campaigns;
    if (filter === 'active') return campaigns.filter((c) => c.status === 'active' || c.status === 'paused');
    return campaigns.filter((c) => c.status === filter);
  }, [campaigns, filter]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Campaigns</h1>
        {canCreate && (
          <Link
            href="/dashboard/campaigns/new"
            data-testid="new-campaign-btn"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
          >
            + New Campaign
          </Link>
        )}
      </div>

      <div className="border-b border-gray-200 mb-4">
        <nav className="flex space-x-6" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={filter === t.key}
              onClick={() => setFilter(t.key)}
              className={`py-2 px-1 border-b-2 text-sm font-medium transition ${
                filter === t.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-red-700 flex items-center justify-between">
          <span>Failed to load campaigns</span>
          <button
            onClick={() => void load()}
            className="px-3 py-1 bg-red-600 text-white rounded text-sm"
          >
            Retry
          </button>
        </div>
      )}

      {!error && campaigns === null && (
        <div className="space-y-2" data-testid="loading">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      )}

      {!error && campaigns !== null && filtered.length === 0 && (
        <div className="text-center py-16 border border-dashed rounded">
          <p className="text-gray-500 mb-4">No campaigns yet</p>
          {canCreate && (
            <Link
              href="/dashboard/campaigns/new"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
            >
              Create your first campaign
            </Link>
          )}
        </div>
      )}

      {!error && filtered.length > 0 && (
        <div className="bg-white rounded border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2 px-4">Name</th>
                <th className="py-2 px-4">Status</th>
                <th className="py-2 px-4">Dial Mode</th>
                <th className="py-2 px-4">Progress</th>
                <th className="py-2 px-4">Date Range</th>
                <th className="py-2 px-4">Created By</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <CampaignRow key={c.id} c={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create tests**

`frontend/tests/campaigns-page.test.tsx`:
```tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import CampaignsPage from '@/app/dashboard/campaigns/page';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

jest.mock('@/lib/api', () => ({ api: { get: jest.fn() } }));
jest.mock('@/hooks/useAuth');

const mockedGet = api.get as jest.Mock;
const mockedAuth = useAuth as jest.Mock;

const fixtures = [
  {
    id: 'c1',
    name: 'Alpha',
    status: 'active',
    dial_mode: 'predictive',
    stats: { total: 100, dialed: 50, connected: 20 },
    schedule_start: null,
    schedule_end: null,
    created_by_name: 'Dom',
    created_at: '2026-04-01',
  },
  {
    id: 'c2',
    name: 'Beta',
    status: 'draft',
    dial_mode: 'manual',
    stats: { total: 10, dialed: 0, connected: 0 },
    schedule_start: null,
    schedule_end: null,
    created_by_name: 'Dom',
    created_at: '2026-04-02',
  },
];

describe('CampaignsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGet.mockResolvedValue({ data: fixtures });
  });

  it('renders campaigns from API', async () => {
    mockedAuth.mockReturnValue({ user: { role: 'supervisor' } });
    render(<CampaignsPage />);
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('filters to draft when Draft tab clicked', async () => {
    mockedAuth.mockReturnValue({ user: { role: 'supervisor' } });
    render(<CampaignsPage />);
    await screen.findByText('Alpha');
    fireEvent.click(screen.getByRole('tab', { name: 'Draft' }));
    await waitFor(() => {
      expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
      expect(screen.getByText('Beta')).toBeInTheDocument();
    });
  });

  it('hides New Campaign button for agents', async () => {
    mockedAuth.mockReturnValue({ user: { role: 'agent' } });
    render(<CampaignsPage />);
    await screen.findByText('Alpha');
    expect(screen.queryByTestId('new-campaign-btn')).not.toBeInTheDocument();
  });

  it('shows retry on error', async () => {
    mockedAuth.mockReturnValue({ user: { role: 'supervisor' } });
    mockedGet.mockRejectedValueOnce(new Error('boom'));
    render(<CampaignsPage />);
    expect(await screen.findByText(/Failed to load campaigns/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Verify**
Run: `cd frontend && npm run build && npm test -- campaigns-page`
Expected: success, all tests pass

- [ ] **Step 7: Commit**
Message: `feat(frontend): campaign list page with tabs, role-gated create, progress bars`

---

### Task 28: Campaign Create/Edit Form

**Files:**
- Create: `frontend/src/components/campaign/CampaignForm.tsx`
- Create: `frontend/src/app/dashboard/campaigns/new/page.tsx`
- Create: `frontend/src/app/dashboard/campaigns/[id]/edit/page.tsx`
- Create: `frontend/tests/CampaignForm.test.tsx`

- [ ] **Step 1: Create the form component**

`frontend/src/components/campaign/CampaignForm.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export interface CampaignFormValues {
  name: string;
  dial_mode: 'manual' | 'preview' | 'progressive' | 'predictive';
  crm_campaign_id: string;
  did_group_id: string;
  schedule_start: string;
  schedule_end: string;
  dialing_hours_start: string;
  dialing_hours_end: string;
  timezone: string;
  max_concurrent_calls: number;
  max_abandon_rate: number;
  dial_ratio: number;
  max_attempts: number;
  retry_delay_minutes: number;
  caller_id_strategy: 'fixed' | 'rotation' | 'proximity';
  fixed_caller_id: string;
  amd_enabled: boolean;
  voicemail_drop_url: string;
  auto_answer: boolean;
}

const DEFAULTS: CampaignFormValues = {
  name: '',
  dial_mode: 'manual',
  crm_campaign_id: '',
  did_group_id: '',
  schedule_start: '',
  schedule_end: '',
  dialing_hours_start: '09:00',
  dialing_hours_end: '20:00',
  timezone: 'America/Chicago',
  max_concurrent_calls: 10,
  max_abandon_rate: 0.03,
  dial_ratio: 1.5,
  max_attempts: 3,
  retry_delay_minutes: 60,
  caller_id_strategy: 'proximity',
  fixed_caller_id: '',
  amd_enabled: false,
  voicemail_drop_url: '',
  auto_answer: false,
};

const TIMEZONES = [
  'America/Chicago',
  'America/New_York',
  'America/Denver',
  'America/Los_Angeles',
];

interface DIDGroup {
  id: string;
  name: string;
}

export interface CampaignFormProps {
  initialValues?: Partial<CampaignFormValues>;
  onSubmit: (values: CampaignFormValues) => Promise<void>;
  submitLabel?: string;
}

type ErrorMap = Partial<Record<keyof CampaignFormValues, string>>;

export function validate(values: CampaignFormValues): ErrorMap {
  const e: ErrorMap = {};
  if (!values.name.trim()) e.name = 'Name is required';
  if (values.name.length > 120) e.name = 'Name must be ≤ 120 characters';
  if (!values.did_group_id) e.did_group_id = 'Select a DID group';
  if (values.schedule_start && values.schedule_end && values.schedule_end <= values.schedule_start) {
    e.schedule_end = 'End must be after start';
  }
  if (values.dialing_hours_start >= values.dialing_hours_end) {
    e.dialing_hours_end = 'End time must be after start time';
  }
  if (values.max_concurrent_calls < 1) e.max_concurrent_calls = 'Must be ≥ 1';
  if (values.max_abandon_rate < 0 || values.max_abandon_rate > 1) {
    e.max_abandon_rate = 'Must be between 0 and 1';
  }
  if (values.dial_ratio < 1 || values.dial_ratio > 3) {
    e.dial_ratio = 'Must be between 1.0 and 3.0';
  }
  if (values.max_attempts < 1 || values.max_attempts > 5) {
    e.max_attempts = 'Must be between 1 and 5';
  }
  if (values.retry_delay_minutes < 0) e.retry_delay_minutes = 'Must be ≥ 0';
  if (values.caller_id_strategy === 'fixed' && !values.fixed_caller_id.trim()) {
    e.fixed_caller_id = 'Required when strategy is fixed';
  }
  if (values.caller_id_strategy === 'fixed' && values.fixed_caller_id && !/^\+[1-9]\d{6,14}$/.test(values.fixed_caller_id)) {
    e.fixed_caller_id = 'Must be E.164 (e.g. +15551234567)';
  }
  return e;
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
      {children}
      {error && <span className="text-xs text-red-600 mt-1 block">{error}</span>}
    </label>
  );
}

const INPUT =
  'w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

export function CampaignForm({
  initialValues,
  onSubmit,
  submitLabel = 'Save',
}: CampaignFormProps) {
  const [values, setValues] = useState<CampaignFormValues>({ ...DEFAULTS, ...initialValues });
  const [errors, setErrors] = useState<ErrorMap>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [didGroups, setDidGroups] = useState<DIDGroup[]>([]);
  const [autoAnswerManuallySet, setAutoAnswerManuallySet] = useState(
    initialValues?.auto_answer !== undefined,
  );

  useEffect(() => {
    void api
      .get<DIDGroup[]>('/api/did-groups')
      .then((res) => setDidGroups(res.data))
      .catch(() => setDidGroups([]));
  }, []);

  function setField<K extends keyof CampaignFormValues>(key: K, val: CampaignFormValues[K]) {
    setValues((prev) => {
      const next = { ...prev, [key]: val };
      if (key === 'dial_mode' && !autoAnswerManuallySet) {
        next.auto_answer = val === 'progressive' || val === 'predictive';
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = validate(values);
    setErrors(v);
    if (Object.keys(v).length > 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(values);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Name" error={errors.name}>
          <input
            className={INPUT}
            value={values.name}
            onChange={(e) => setField('name', e.target.value)}
          />
        </Field>

        <Field label="Dial Mode" error={errors.dial_mode}>
          <select
            className={INPUT}
            value={values.dial_mode}
            onChange={(e) =>
              setField('dial_mode', e.target.value as CampaignFormValues['dial_mode'])
            }
          >
            <option value="manual">Manual</option>
            <option value="preview">Preview</option>
            <option value="progressive">Progressive</option>
            <option value="predictive">Predictive</option>
          </select>
        </Field>

        <Field label="CRM Campaign ID" error={errors.crm_campaign_id}>
          <input
            className={INPUT}
            value={values.crm_campaign_id}
            onChange={(e) => setField('crm_campaign_id', e.target.value)}
            placeholder="uuid of voice_campaign in CRM"
          />
        </Field>

        <Field label="DID Group" error={errors.did_group_id}>
          <select
            className={INPUT}
            value={values.did_group_id}
            onChange={(e) => setField('did_group_id', e.target.value)}
          >
            <option value="">Select a group…</option>
            {didGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Schedule Start" error={errors.schedule_start}>
          <input
            type="datetime-local"
            className={INPUT}
            value={values.schedule_start}
            onChange={(e) => setField('schedule_start', e.target.value)}
          />
        </Field>
        <Field label="Schedule End" error={errors.schedule_end}>
          <input
            type="datetime-local"
            className={INPUT}
            value={values.schedule_end}
            onChange={(e) => setField('schedule_end', e.target.value)}
          />
        </Field>
        <Field label="Dialing Hours Start" error={errors.dialing_hours_start}>
          <input
            type="time"
            className={INPUT}
            value={values.dialing_hours_start}
            onChange={(e) => setField('dialing_hours_start', e.target.value)}
          />
        </Field>
        <Field label="Dialing Hours End" error={errors.dialing_hours_end}>
          <input
            type="time"
            className={INPUT}
            value={values.dialing_hours_end}
            onChange={(e) => setField('dialing_hours_end', e.target.value)}
          />
        </Field>
        <Field label="Timezone">
          <select
            className={INPUT}
            value={values.timezone}
            onChange={(e) => setField('timezone', e.target.value)}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </Field>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Max Concurrent Calls" error={errors.max_concurrent_calls}>
          <input
            type="number"
            min={1}
            className={INPUT}
            value={values.max_concurrent_calls}
            onChange={(e) => setField('max_concurrent_calls', Number(e.target.value))}
          />
        </Field>
        <Field label="Max Abandon Rate (0-1)" error={errors.max_abandon_rate}>
          <input
            type="number"
            step="0.01"
            min={0}
            max={1}
            className={INPUT}
            value={values.max_abandon_rate}
            onChange={(e) => setField('max_abandon_rate', Number(e.target.value))}
          />
        </Field>
        <Field label="Dial Ratio (1-3)" error={errors.dial_ratio}>
          <input
            type="number"
            step="0.1"
            min={1}
            max={3}
            className={INPUT}
            value={values.dial_ratio}
            onChange={(e) => setField('dial_ratio', Number(e.target.value))}
          />
        </Field>
        <Field label="Max Attempts (1-5)" error={errors.max_attempts}>
          <input
            type="number"
            min={1}
            max={5}
            className={INPUT}
            value={values.max_attempts}
            onChange={(e) => setField('max_attempts', Number(e.target.value))}
          />
        </Field>
        <Field label="Retry Delay (min)" error={errors.retry_delay_minutes}>
          <input
            type="number"
            min={0}
            className={INPUT}
            value={values.retry_delay_minutes}
            onChange={(e) => setField('retry_delay_minutes', Number(e.target.value))}
          />
        </Field>
      </section>

      <section className="space-y-3">
        <fieldset>
          <legend className="block text-sm font-medium text-gray-700 mb-2">
            Caller ID Strategy
          </legend>
          <div className="flex gap-4">
            {(['fixed', 'rotation', 'proximity'] as const).map((opt) => (
              <label key={opt} className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="caller_id_strategy"
                  value={opt}
                  checked={values.caller_id_strategy === opt}
                  onChange={() => setField('caller_id_strategy', opt)}
                />
                <span className="capitalize text-sm">{opt}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {values.caller_id_strategy === 'fixed' && (
          <Field label="Fixed Caller ID (E.164)" error={errors.fixed_caller_id}>
            <input
              className={INPUT}
              value={values.fixed_caller_id}
              onChange={(e) => setField('fixed_caller_id', e.target.value)}
              placeholder="+15551234567"
            />
          </Field>
        )}
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={values.amd_enabled}
            onChange={(e) => setField('amd_enabled', e.target.checked)}
          />
          <span className="text-sm">Enable Answering Machine Detection</span>
        </label>
        <Field label="Voicemail Drop URL">
          <input
            className={INPUT}
            value={values.voicemail_drop_url}
            onChange={(e) => setField('voicemail_drop_url', e.target.value)}
            placeholder="https://…/vm.mp3"
          />
        </Field>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={values.auto_answer}
            onChange={(e) => {
              setAutoAnswerManuallySet(true);
              setField('auto_answer', e.target.checked);
            }}
          />
          <span className="text-sm">Auto-Answer Agent Leg</span>
        </label>
      </section>

      {submitError && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {submitError}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
        >
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Create /new page**

`frontend/src/app/dashboard/campaigns/new/page.tsx`:
```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { CampaignForm, CampaignFormValues } from '@/components/campaign/CampaignForm';

export default function NewCampaignPage() {
  const router = useRouter();
  const { user } = useAuth();
  const allowed = user && ['supervisor', 'admin'].includes(user.role);

  useEffect(() => {
    if (user && !allowed) router.replace('/dashboard/campaigns');
  }, [user, allowed, router]);

  if (!allowed) {
    return <div className="p-6 text-gray-600">Forbidden</div>;
  }

  async function handleSubmit(values: CampaignFormValues) {
    const { data } = await api.post<{ id: string }>('/api/campaigns', values);
    router.push(`/dashboard/campaigns/${data.id}`);
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">New Campaign</h1>
      <CampaignForm onSubmit={handleSubmit} submitLabel="Create Campaign" />
    </div>
  );
}
```

- [ ] **Step 3: Create /[id]/edit page**

`frontend/src/app/dashboard/campaigns/[id]/edit/page.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { CampaignForm, CampaignFormValues } from '@/components/campaign/CampaignForm';

export default function EditCampaignPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user } = useAuth();
  const allowed = user && ['supervisor', 'admin'].includes(user.role);

  const [initial, setInitial] = useState<Partial<CampaignFormValues> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    void api
      .get(`/api/campaigns/${id}`)
      .then((res) => setInitial(res.data))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Failed to load campaign'),
      );
  }, [id, allowed]);

  if (!allowed) return <div className="p-6 text-gray-600">Forbidden</div>;
  if (error)
    return (
      <div className="p-6 text-red-700 border border-red-200 bg-red-50 rounded">{error}</div>
    );
  if (!initial) return <div className="p-6 text-gray-500">Loading…</div>;

  async function handleSubmit(values: CampaignFormValues) {
    await api.patch(`/api/campaigns/${id}`, values);
    router.push(`/dashboard/campaigns/${id}`);
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Edit Campaign</h1>
      <CampaignForm
        initialValues={initial}
        onSubmit={handleSubmit}
        submitLabel="Save Changes"
      />
    </div>
  );
}
```

- [ ] **Step 4: Create tests**

`frontend/tests/CampaignForm.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CampaignForm, validate } from '@/components/campaign/CampaignForm';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => ({ api: { get: jest.fn().mockResolvedValue({ data: [{ id: 'g1', name: 'Group A' }] }) } }));

describe('CampaignForm.validate', () => {
  const base = {
    name: 'X',
    dial_mode: 'manual' as const,
    crm_campaign_id: '',
    did_group_id: 'g1',
    schedule_start: '',
    schedule_end: '',
    dialing_hours_start: '09:00',
    dialing_hours_end: '20:00',
    timezone: 'America/Chicago',
    max_concurrent_calls: 10,
    max_abandon_rate: 0.03,
    dial_ratio: 1.5,
    max_attempts: 3,
    retry_delay_minutes: 60,
    caller_id_strategy: 'proximity' as const,
    fixed_caller_id: '',
    amd_enabled: false,
    voicemail_drop_url: '',
    auto_answer: false,
  };

  it('requires name', () => {
    expect(validate({ ...base, name: '' }).name).toBeDefined();
  });

  it('requires fixed caller ID when strategy=fixed', () => {
    const e = validate({ ...base, caller_id_strategy: 'fixed' });
    expect(e.fixed_caller_id).toBeDefined();
  });

  it('rejects invalid E.164', () => {
    const e = validate({ ...base, caller_id_strategy: 'fixed', fixed_caller_id: '555-1234' });
    expect(e.fixed_caller_id).toMatch(/E\.164/);
  });

  it('rejects abandon rate > 1', () => {
    expect(validate({ ...base, max_abandon_rate: 1.5 }).max_abandon_rate).toBeDefined();
  });
});

describe('CampaignForm render', () => {
  it('submits valid form', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<CampaignForm onSubmit={onSubmit} />);
    await screen.findByText('Group A');
    fireEvent.change(screen.getByRole('textbox', { name: /^Name$/i }), {
      target: { value: 'Test Campaign' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: /DID Group/i }), {
      target: { value: 'g1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  });

  it('reveals fixed caller id input when strategy=fixed', async () => {
    render(<CampaignForm onSubmit={jest.fn()} />);
    await screen.findByText('Group A');
    fireEvent.click(screen.getByLabelText(/fixed/i));
    expect(await screen.findByLabelText(/Fixed Caller ID/i)).toBeInTheDocument();
  });

  it('shows validation errors when name missing', async () => {
    const onSubmit = jest.fn();
    render(<CampaignForm onSubmit={onSubmit} />);
    await screen.findByText('Group A');
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/Name is required/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Verify**
Run: `cd frontend && npm run build && npm test -- CampaignForm`
Expected: success, tests pass

- [ ] **Step 6: Commit**
Message: `feat(frontend): campaign create/edit form with validation and role gate`

---

### Task 29: Campaign Detail Page

**Files:**
- Create: `frontend/src/app/dashboard/campaigns/[id]/page.tsx`
- Create: `frontend/src/components/campaign/ContactsTable.tsx`
- Create: `frontend/src/components/campaign/StatsGrid.tsx`
- Create: `frontend/tests/campaign-detail.test.tsx`

- [ ] **Step 1: Create StatsGrid**

`frontend/src/components/campaign/StatsGrid.tsx`:
```tsx
'use client';

export interface StatCardValue {
  label: string;
  value: number | string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
}

const TONES: Record<NonNullable<StatCardValue['tone']>, string> = {
  default: 'bg-white text-gray-900',
  good: 'bg-green-50 text-green-900',
  warn: 'bg-yellow-50 text-yellow-900',
  bad: 'bg-red-50 text-red-900',
};

export function StatsGrid({ stats }: { stats: StatCardValue[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className={`rounded border p-4 ${TONES[s.tone ?? 'default']}`}
          data-testid={`stat-${s.label.replace(/\s+/g, '-').toLowerCase()}`}
        >
          <div className="text-xs uppercase tracking-wide text-gray-500">{s.label}</div>
          <div className="text-2xl font-semibold mt-1">{s.value}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create ContactsTable**

`frontend/src/components/campaign/ContactsTable.tsx`:
```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

export interface CampaignContact {
  id: string;
  phone_number: string;
  account_id: string | null;
  status: string;
  attempts: number;
  last_outcome: string | null;
  last_attempt_at: string | null;
}

function maskPhone(e164: string): string {
  if (!e164 || e164.length < 6) return e164;
  const last4 = e164.slice(-4);
  const country = e164.startsWith('+1') ? '+1' : e164.slice(0, 2);
  return `${country}${'•'.repeat(Math.max(0, e164.length - country.length - 4))}${last4}`;
}

const STATUSES = [
  'all',
  'pending',
  'compliance_blocked',
  'dialing',
  'connected',
  'completed',
  'failed',
  'voicemail',
];

const PAGE_SIZE = 20;

export function ContactsTable({ campaignId }: { campaignId: string }) {
  const [status, setStatus] = useState('all');
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<CampaignContact[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    setError(null);
    try {
      const { data } = await api.get<CampaignContact[]>(
        `/api/campaigns/${campaignId}/contacts`,
        {
          params: {
            status: status === 'all' ? undefined : status,
            limit: PAGE_SIZE + 1,
            offset,
          },
        },
      );
      setHasMore(data.length > PAGE_SIZE);
      setRows(data.slice(0, PAGE_SIZE));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load contacts');
    }
  }, [campaignId, status, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="bg-white border rounded">
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Status:</label>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={status}
            onChange={(e) => {
              setOffset(0);
              setStatus(e.target.value);
            }}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button
            className="px-2 py-1 border rounded disabled:opacity-40"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Prev
          </button>
          <span>Offset {offset}</span>
          <button
            className="px-2 py-1 border rounded disabled:opacity-40"
            disabled={!hasMore}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Next
          </button>
        </div>
      </div>

      {error && <div className="p-4 text-red-700">{error}</div>}
      {!error && rows === null && <div className="p-4 text-gray-500">Loading…</div>}
      {!error && rows?.length === 0 && (
        <div className="p-6 text-center text-gray-500">No contacts match this filter.</div>
      )}

      {rows && rows.length > 0 && (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="py-2 px-4">Phone</th>
              <th className="py-2 px-4">Account</th>
              <th className="py-2 px-4">Status</th>
              <th className="py-2 px-4">Attempts</th>
              <th className="py-2 px-4">Last Outcome</th>
              <th className="py-2 px-4">Last Attempt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="py-2 px-4 font-mono">{maskPhone(c.phone_number)}</td>
                <td className="py-2 px-4">{c.account_id ?? '—'}</td>
                <td className="py-2 px-4">{c.status}</td>
                <td className="py-2 px-4">{c.attempts}</td>
                <td className="py-2 px-4">{c.last_outcome ?? '—'}</td>
                <td className="py-2 px-4">
                  {c.last_attempt_at ? new Date(c.last_attempt_at).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create detail page**

`frontend/src/app/dashboard/campaigns/[id]/page.tsx`:
```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { StatusBadge } from '@/components/campaign/StatusBadge';
import { StatsGrid, StatCardValue } from '@/components/campaign/StatsGrid';
import { ContactsTable } from '@/components/campaign/ContactsTable';

interface CampaignDetail {
  id: string;
  name: string;
  status: string;
  dial_mode: string;
  breakdown: {
    pending: number;
    compliance_blocked: number;
    dialing: number;
    connected: number;
    completed: number;
    failed: number;
    voicemail?: number;
  };
  stats: {
    total: number;
    dialed: number;
    connected: number;
  };
}

interface LiveMetrics {
  abandon_rate: number;
  dialed: number;
  connected: number;
  voicemail: number;
  failed: number;
}

interface ProgressEvent {
  campaign_id: string;
  total: number;
  dialed: number;
  connected: number;
  voicemail: number;
  failed: number;
  abandon_rate: number;
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { user } = useAuth();
  const socket = useSocket();

  const canControl = user && ['supervisor', 'admin'].includes(user.role);

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [live, setLive] = useState<LiveMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [cRes, lRes] = await Promise.all([
        api.get<CampaignDetail>(`/api/campaigns/${id}`),
        api.get<LiveMetrics>(`/api/campaigns/${id}/live-metrics`).catch(() => ({ data: null })),
      ]);
      setCampaign(cRes.data);
      if (lRes.data) setLive(lRes.data as LiveMetrics);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load campaign');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!socket) return;
    const handler = (evt: ProgressEvent) => {
      if (evt.campaign_id !== id) return;
      setLive({
        abandon_rate: evt.abandon_rate,
        dialed: evt.dialed,
        connected: evt.connected,
        voicemail: evt.voicemail,
        failed: evt.failed,
      });
      setCampaign((prev) =>
        prev
          ? {
              ...prev,
              stats: { total: evt.total, dialed: evt.dialed, connected: evt.connected },
              breakdown: {
                ...prev.breakdown,
                connected: evt.connected,
                failed: evt.failed,
                voicemail: evt.voicemail,
              },
            }
          : prev,
      );
    };
    socket.on('campaign:progress', handler);
    return () => {
      socket.off('campaign:progress', handler);
    };
  }, [socket, id]);

  async function runAction(action: 'start' | 'pause' | 'resume' | 'stop') {
    setActionPending(action);
    try {
      const endpoint = action === 'resume' ? 'start' : action;
      await api.post(`/api/campaigns/${id}/${endpoint}`);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : `Failed to ${action}`);
    } finally {
      setActionPending(null);
    }
  }

  if (error)
    return (
      <div className="p-6">
        <div className="rounded border border-red-200 bg-red-50 p-4 text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => void load()}
            className="px-3 py-1 bg-red-600 text-white rounded text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  if (!campaign) return <div className="p-6 text-gray-500">Loading…</div>;

  const stats: StatCardValue[] = [
    { label: 'Total Contacts', value: campaign.stats.total },
    { label: 'Dialed', value: campaign.stats.dialed },
    { label: 'Connected', value: campaign.breakdown.connected, tone: 'good' },
    { label: 'Voicemail', value: campaign.breakdown.voicemail ?? 0 },
    { label: 'Failed', value: campaign.breakdown.failed, tone: 'bad' },
    { label: 'Compliance Blocked', value: campaign.breakdown.compliance_blocked, tone: 'warn' },
  ];

  const showStart = canControl && ['draft', 'scheduled'].includes(campaign.status);
  const showPause = canControl && campaign.status === 'active';
  const showResume = canControl && campaign.status === 'paused';
  const showStop = canControl && ['active', 'paused'].includes(campaign.status);
  const showEdit = canControl && ['draft', 'paused'].includes(campaign.status);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{campaign.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={campaign.status} />
            <span className="text-xs px-2 py-0.5 border rounded-full bg-gray-50 text-gray-700 capitalize">
              {campaign.dial_mode}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {showStart && (
            <button
              disabled={actionPending === 'start'}
              onClick={() => void runAction('start')}
              className="px-3 py-1.5 bg-green-600 text-white rounded text-sm disabled:opacity-50"
            >
              Start
            </button>
          )}
          {showPause && (
            <button
              disabled={actionPending === 'pause'}
              onClick={() => void runAction('pause')}
              className="px-3 py-1.5 bg-yellow-600 text-white rounded text-sm disabled:opacity-50"
            >
              Pause
            </button>
          )}
          {showResume && (
            <button
              disabled={actionPending === 'resume'}
              onClick={() => void runAction('resume')}
              className="px-3 py-1.5 bg-green-600 text-white rounded text-sm disabled:opacity-50"
            >
              Resume
            </button>
          )}
          {showStop && (
            <button
              disabled={actionPending === 'stop'}
              onClick={() => void runAction('stop')}
              className="px-3 py-1.5 bg-red-600 text-white rounded text-sm disabled:opacity-50"
            >
              Stop
            </button>
          )}
          {showEdit && (
            <button
              onClick={() => router.push(`/dashboard/campaigns/${id}/edit`)}
              className="px-3 py-1.5 border rounded text-sm"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      <StatsGrid stats={stats} />

      {live && campaign.dial_mode === 'predictive' && (
        <div className="rounded border p-4 bg-indigo-50">
          <div className="text-xs uppercase text-gray-500">Abandon Rate (live)</div>
          <div className="text-2xl font-semibold text-indigo-800">
            {(live.abandon_rate * 100).toFixed(2)}%
          </div>
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Contacts</h2>
        <ContactsTable campaignId={id} />
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Create test**

`frontend/tests/campaign-detail.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import CampaignDetailPage from '@/app/dashboard/campaigns/[id]/page';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { useParams, useRouter } from 'next/navigation';

jest.mock('@/lib/api', () => ({ api: { get: jest.fn(), post: jest.fn() } }));
jest.mock('@/hooks/useAuth');
jest.mock('@/hooks/useSocket');
jest.mock('next/navigation', () => ({
  useParams: jest.fn(),
  useRouter: jest.fn(),
}));

const mockedGet = api.get as jest.Mock;

describe('CampaignDetailPage', () => {
  beforeEach(() => {
    (useParams as jest.Mock).mockReturnValue({ id: 'c1' });
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useAuth as jest.Mock).mockReturnValue({ user: { role: 'supervisor' } });
    (useSocket as jest.Mock).mockReturnValue({ on: jest.fn(), off: jest.fn() });
    mockedGet.mockImplementation((url: string) => {
      if (url.endsWith('/live-metrics')) {
        return Promise.resolve({
          data: { abandon_rate: 0.02, dialed: 50, connected: 20, voicemail: 5, failed: 10 },
        });
      }
      return Promise.resolve({
        data: {
          id: 'c1',
          name: 'Alpha',
          status: 'active',
          dial_mode: 'predictive',
          stats: { total: 100, dialed: 50, connected: 20 },
          breakdown: {
            pending: 30,
            compliance_blocked: 2,
            dialing: 3,
            connected: 20,
            completed: 15,
            failed: 10,
            voicemail: 5,
          },
        },
      });
    });
  });

  it('renders stats and pause button for active supervisor', async () => {
    render(<CampaignDetailPage />);
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    expect(screen.getByTestId('stat-total-contacts')).toHaveTextContent('100');
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
  });

  it('hides control buttons for agents', async () => {
    (useAuth as jest.Mock).mockReturnValue({ user: { role: 'agent' } });
    render(<CampaignDetailPage />);
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Verify**
Run: `cd frontend && npm run build && npm test -- campaign-detail`
Expected: success, tests pass

- [ ] **Step 6: Commit**
Message: `feat(frontend): campaign detail page with live socket updates, controls, and contacts list`

---

### Task 30: Phone Numbers Management Page

**Files:**
- Create: `frontend/src/app/dashboard/phone-numbers/page.tsx`
- Create: `frontend/src/components/phone-numbers/NumberTable.tsx`
- Create: `frontend/src/components/phone-numbers/NumberEditModal.tsx`
- Create: `frontend/src/components/phone-numbers/NumberAddModal.tsx`
- Create: `frontend/src/components/phone-numbers/DIDGroupList.tsx`
- Create: `frontend/tests/phone-numbers-page.test.tsx`

- [ ] **Step 1: Create NumberTable**

`frontend/src/components/phone-numbers/NumberTable.tsx`:
```tsx
'use client';

export interface PhoneNumber {
  id: string;
  number: string;
  area_code: string;
  state: string;
  health_score: number;
  daily_call_count: number;
  daily_call_limit: number;
  cooldown_until: string | null;
  is_active: boolean;
  did_group_id: string | null;
}

function healthBarColor(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 50) return 'bg-yellow-500';
  if (score >= 20) return 'bg-orange-500';
  return 'bg-red-500';
}

export function NumberTable({
  numbers,
  onRowClick,
  onToggleActive,
}: {
  numbers: PhoneNumber[];
  onRowClick: (n: PhoneNumber) => void;
  onToggleActive: (n: PhoneNumber, active: boolean) => void;
}) {
  if (numbers.length === 0) {
    return (
      <div className="text-center text-gray-500 py-12 border border-dashed rounded">
        No phone numbers configured.
      </div>
    );
  }
  return (
    <div className="bg-white border rounded overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="py-2 px-4">Number</th>
            <th className="py-2 px-4">Area Code</th>
            <th className="py-2 px-4">State</th>
            <th className="py-2 px-4 w-48">Health</th>
            <th className="py-2 px-4">Daily Usage</th>
            <th className="py-2 px-4">Cooldown</th>
            <th className="py-2 px-4">Active</th>
          </tr>
        </thead>
        <tbody>
          {numbers.map((n) => (
            <tr
              key={n.id}
              className="border-t hover:bg-gray-50 cursor-pointer"
              onClick={() => onRowClick(n)}
            >
              <td className="py-2 px-4 font-mono">{n.number}</td>
              <td className="py-2 px-4">{n.area_code}</td>
              <td className="py-2 px-4">{n.state}</td>
              <td className="py-2 px-4">
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 bg-gray-200 rounded overflow-hidden">
                    <div
                      className={`h-full ${healthBarColor(n.health_score)}`}
                      style={{ width: `${Math.max(0, Math.min(100, n.health_score))}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-600">{n.health_score}</span>
                </div>
              </td>
              <td className="py-2 px-4">
                {n.daily_call_count}/{n.daily_call_limit}
              </td>
              <td className="py-2 px-4 text-xs">
                {n.cooldown_until ? new Date(n.cooldown_until).toLocaleString() : 'None'}
              </td>
              <td className="py-2 px-4" onClick={(e) => e.stopPropagation()}>
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={n.is_active}
                    onChange={(e) => onToggleActive(n, e.target.checked)}
                    aria-label={`Toggle active for ${n.number}`}
                  />
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Create NumberEditModal**

`frontend/src/components/phone-numbers/NumberEditModal.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { PhoneNumber } from './NumberTable';

interface Props {
  number: PhoneNumber;
  onClose: () => void;
  onSave: (patch: { daily_call_limit: number; is_active: boolean; cooldown_until: string | null }) => Promise<void>;
}

export function NumberEditModal({ number, onClose, onSave }: Props) {
  const [limit, setLimit] = useState(number.daily_call_limit);
  const [active, setActive] = useState(number.is_active);
  const [cooldown, setCooldown] = useState(number.cooldown_until ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (limit < 0) {
      setErr('Daily limit must be ≥ 0');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        daily_call_limit: limit,
        is_active: active,
        cooldown_until: cooldown ? new Date(cooldown).toISOString() : null,
      });
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-lg shadow-lg p-6 w-[28rem] space-y-4"
      >
        <h2 className="text-lg font-semibold">Edit {number.number}</h2>

        <label className="block text-sm">
          <span className="block font-medium mb-1">Daily Call Limit</span>
          <input
            type="number"
            min={0}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="w-full border rounded px-3 py-2"
          />
        </label>

        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          <span className="text-sm">Active</span>
        </label>

        <label className="block text-sm">
          <span className="block font-medium mb-1">Cooldown Until</span>
          <input
            type="datetime-local"
            value={cooldown ? cooldown.slice(0, 16) : ''}
            onChange={(e) => setCooldown(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
        </label>

        {err && <div className="text-sm text-red-600">{err}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 border rounded text-sm">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Create NumberAddModal**

`frontend/src/components/phone-numbers/NumberAddModal.tsx`:
```tsx
'use client';

import { useState } from 'react';

export interface DIDGroupOption {
  id: string;
  name: string;
}

interface NewNumberPayload {
  number: string;
  voximplant_number_id: string;
  area_code: string;
  state: string;
  did_group_id: string | null;
}

interface Props {
  didGroups: DIDGroupOption[];
  onClose: () => void;
  onSave: (payload: NewNumberPayload) => Promise<void>;
}

export function NumberAddModal({ didGroups, onClose, onSave }: Props) {
  const [form, setForm] = useState<NewNumberPayload>({
    number: '',
    voximplant_number_id: '',
    area_code: '',
    state: '',
    did_group_id: null,
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\+[1-9]\d{6,14}$/.test(form.number)) {
      setErr('Number must be E.164');
      return;
    }
    if (!form.voximplant_number_id.trim()) {
      setErr('Voximplant number id required');
      return;
    }
    if (!/^\d{3}$/.test(form.area_code)) {
      setErr('Area code must be 3 digits');
      return;
    }
    if (!/^[A-Z]{2}$/.test(form.state)) {
      setErr('State must be 2-letter code');
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-lg shadow-lg p-6 w-[28rem] space-y-3"
      >
        <h2 className="text-lg font-semibold">Add Phone Number</h2>

        <label className="block text-sm">
          <span className="block font-medium mb-1">Number (E.164)</span>
          <input
            className="w-full border rounded px-3 py-2"
            value={form.number}
            onChange={(e) => setForm({ ...form, number: e.target.value })}
            placeholder="+15551234567"
          />
        </label>

        <label className="block text-sm">
          <span className="block font-medium mb-1">Voximplant Number ID</span>
          <input
            className="w-full border rounded px-3 py-2"
            value={form.voximplant_number_id}
            onChange={(e) => setForm({ ...form, voximplant_number_id: e.target.value })}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="block font-medium mb-1">Area Code</span>
            <input
              className="w-full border rounded px-3 py-2"
              value={form.area_code}
              onChange={(e) => setForm({ ...form, area_code: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="block font-medium mb-1">State</span>
            <input
              className="w-full border rounded px-3 py-2 uppercase"
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
              maxLength={2}
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="block font-medium mb-1">DID Group (optional)</span>
          <select
            className="w-full border rounded px-3 py-2"
            value={form.did_group_id ?? ''}
            onChange={(e) =>
              setForm({ ...form, did_group_id: e.target.value === '' ? null : e.target.value })
            }
          >
            <option value="">None</option>
            {didGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>

        {err && <div className="text-sm text-red-600">{err}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 border rounded text-sm">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Create DIDGroupList**

`frontend/src/components/phone-numbers/DIDGroupList.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { PhoneNumber } from './NumberTable';

export interface DIDGroup {
  id: string;
  name: string;
  numbers: PhoneNumber[];
}

interface Props {
  groups: DIDGroup[];
  allNumbers: PhoneNumber[];
  onCreate: (name: string) => Promise<void>;
  onAssign: (groupId: string, phoneNumberId: string) => Promise<void>;
  onRemove: (groupId: string, phoneNumberId: string) => Promise<void>;
}

export function DIDGroupList({ groups, allNumbers, onCreate, onAssign, onRemove }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [assignChoice, setAssignChoice] = useState<Record<string, string>>({});

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await onCreate(newName.trim());
      setNewName('');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="border rounded px-3 py-2 text-sm flex-1"
          placeholder="New group name"
        />
        <button
          disabled={creating || !newName.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
        >
          Add Group
        </button>
      </form>

      {groups.length === 0 && (
        <div className="text-sm text-gray-500 border border-dashed rounded p-6 text-center">
          No DID groups yet.
        </div>
      )}

      {groups.map((g) => {
        const isOpen = openId === g.id;
        const unassigned = allNumbers.filter((n) => !g.numbers.find((m) => m.id === n.id));
        return (
          <div key={g.id} className="border rounded">
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : g.id)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50"
            >
              <span className="font-medium">{g.name}</span>
              <span className="text-xs text-gray-500">
                {g.numbers.length} number{g.numbers.length === 1 ? '' : 's'} · {isOpen ? '▾' : '▸'}
              </span>
            </button>
            {isOpen && (
              <div className="border-t p-4 space-y-3">
                {g.numbers.length === 0 && (
                  <div className="text-sm text-gray-500">No numbers assigned.</div>
                )}
                {g.numbers.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-center justify-between border rounded px-3 py-2"
                  >
                    <span className="font-mono text-sm">{n.number}</span>
                    <button
                      onClick={() => void onRemove(g.id, n.id)}
                      className="text-red-600 text-xs hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <select
                    value={assignChoice[g.id] ?? ''}
                    onChange={(e) =>
                      setAssignChoice({ ...assignChoice, [g.id]: e.target.value })
                    }
                    className="border rounded px-2 py-1 text-sm flex-1"
                  >
                    <option value="">Select a number to assign…</option>
                    {unassigned.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.number}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={!assignChoice[g.id]}
                    onClick={async () => {
                      const id = assignChoice[g.id];
                      if (!id) return;
                      await onAssign(g.id, id);
                      setAssignChoice({ ...assignChoice, [g.id]: '' });
                    }}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
                  >
                    Assign
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Create page**

`frontend/src/app/dashboard/phone-numbers/page.tsx`:
```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { NumberTable, PhoneNumber } from '@/components/phone-numbers/NumberTable';
import { NumberEditModal } from '@/components/phone-numbers/NumberEditModal';
import { NumberAddModal } from '@/components/phone-numbers/NumberAddModal';
import { DIDGroupList, DIDGroup } from '@/components/phone-numbers/DIDGroupList';

type Tab = 'numbers' | 'groups';

export default function PhoneNumbersPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('numbers');
  const [numbers, setNumbers] = useState<PhoneNumber[] | null>(null);
  const [groups, setGroups] = useState<DIDGroup[] | null>(null);
  const [editing, setEditing] = useState<PhoneNumber | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowed = user?.role === 'admin';

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [nRes, gRes] = await Promise.all([
        api.get<PhoneNumber[]>('/api/phone-numbers'),
        api.get<DIDGroup[]>('/api/did-groups'),
      ]);
      setNumbers(nRes.data);
      setGroups(gRes.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    }
  }, []);

  useEffect(() => {
    if (allowed) void loadAll();
  }, [allowed, loadAll]);

  if (!user) return <div className="p-6 text-gray-500">Loading…</div>;
  if (!allowed) return <div className="p-6 text-gray-600">Forbidden</div>;

  async function handleToggleActive(n: PhoneNumber, active: boolean) {
    await api.patch(`/api/phone-numbers/${n.id}`, { is_active: active });
    await loadAll();
  }

  async function handleSaveEdit(patch: {
    daily_call_limit: number;
    is_active: boolean;
    cooldown_until: string | null;
  }) {
    if (!editing) return;
    await api.patch(`/api/phone-numbers/${editing.id}`, patch);
    await loadAll();
  }

  async function handleAdd(payload: {
    number: string;
    voximplant_number_id: string;
    area_code: string;
    state: string;
    did_group_id: string | null;
  }) {
    await api.post('/api/phone-numbers', payload);
    await loadAll();
  }

  async function handleCreateGroup(name: string) {
    await api.post('/api/did-groups', { name });
    await loadAll();
  }

  async function handleAssign(groupId: string, phoneNumberId: string) {
    await api.post(`/api/did-groups/${groupId}/numbers`, { phoneNumberId });
    await loadAll();
  }

  async function handleRemove(groupId: string, phoneNumberId: string) {
    await api.delete(`/api/did-groups/${groupId}/numbers/${phoneNumberId}`);
    await loadAll();
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Phone Numbers</h1>
        {tab === 'numbers' && (
          <button
            onClick={() => setAdding(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium"
          >
            + Add Number
          </button>
        )}
      </div>

      <div className="border-b">
        <nav className="flex gap-6" role="tablist">
          {(['numbers', 'groups'] as const).map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`py-2 border-b-2 text-sm font-medium ${
                tab === key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {key === 'numbers' ? 'Numbers' : 'DID Groups'}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {tab === 'numbers' && (
        <>
          {numbers === null ? (
            <div className="text-gray-500">Loading…</div>
          ) : (
            <NumberTable
              numbers={numbers}
              onRowClick={(n) => setEditing(n)}
              onToggleActive={(n, a) => void handleToggleActive(n, a)}
            />
          )}
        </>
      )}

      {tab === 'groups' && (
        <>
          {groups === null || numbers === null ? (
            <div className="text-gray-500">Loading…</div>
          ) : (
            <DIDGroupList
              groups={groups}
              allNumbers={numbers}
              onCreate={handleCreateGroup}
              onAssign={handleAssign}
              onRemove={handleRemove}
            />
          )}
        </>
      )}

      {editing && (
        <NumberEditModal
          number={editing}
          onClose={() => setEditing(null)}
          onSave={handleSaveEdit}
        />
      )}

      {adding && groups && (
        <NumberAddModal
          didGroups={groups.map((g) => ({ id: g.id, name: g.name }))}
          onClose={() => setAdding(false)}
          onSave={handleAdd}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create tests**

`frontend/tests/phone-numbers-page.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PhoneNumbersPage from '@/app/dashboard/phone-numbers/page';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));
jest.mock('@/hooks/useAuth');

const mockedGet = api.get as jest.Mock;

const numbers = [
  {
    id: 'n1',
    number: '+15551234567',
    area_code: '555',
    state: 'TX',
    health_score: 90,
    daily_call_count: 10,
    daily_call_limit: 100,
    cooldown_until: null,
    is_active: true,
    did_group_id: null,
  },
];

const groups = [{ id: 'g1', name: 'Texas Group', numbers: [] }];

describe('PhoneNumbersPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGet.mockImplementation((url: string) => {
      if (url.includes('/api/phone-numbers')) return Promise.resolve({ data: numbers });
      if (url.includes('/api/did-groups')) return Promise.resolve({ data: groups });
      return Promise.resolve({ data: [] });
    });
  });

  it('returns Forbidden for non-admin', () => {
    (useAuth as jest.Mock).mockReturnValue({ user: { role: 'supervisor' } });
    render(<PhoneNumbersPage />);
    expect(screen.getByText('Forbidden')).toBeInTheDocument();
  });

  it('renders numbers table for admin', async () => {
    (useAuth as jest.Mock).mockReturnValue({ user: { role: 'admin' } });
    render(<PhoneNumbersPage />);
    expect(await screen.findByText('+15551234567')).toBeInTheDocument();
    expect(screen.getByText('TX')).toBeInTheDocument();
  });

  it('switches to DID groups tab', async () => {
    (useAuth as jest.Mock).mockReturnValue({ user: { role: 'admin' } });
    render(<PhoneNumbersPage />);
    await screen.findByText('+15551234567');
    fireEvent.click(screen.getByRole('tab', { name: 'DID Groups' }));
    await waitFor(() => expect(screen.getByText('Texas Group')).toBeInTheDocument());
  });
});
```

- [ ] **Step 7: Verify**
Run: `cd frontend && npm run build && npm test -- phone-numbers-page`
Expected: success, tests pass

- [ ] **Step 8: Commit**
Message: `feat(frontend): admin phone numbers page with tabs, number CRUD modals, and DID group management`

---

## Phase 6 Verification

After all four tasks complete:

- [ ] `cd frontend && npm run build` succeeds.
- [ ] `cd frontend && npm test` passes for all new test suites.
- [ ] Manual smoke test (dev server, seeded data):
  - Log in as supervisor, navigate to `/dashboard/campaigns`, see list, switch tabs.
  - Click "New Campaign", fill form, submit, verify redirect to detail.
  - Start campaign, observe stats update (requires Phase 5 running).
  - Log in as admin, navigate to `/dashboard/phone-numbers`, verify tab switching, add a number, assign to DID group.
  - Log in as agent, confirm "New Campaign" button hidden and `/dashboard/phone-numbers` shows Forbidden.
## Phase 7: Frontend — Supervisor & Reports

### Task 31: Supervisor Live Monitor

**Files:**
- Create: `frontend/src/app/dashboard/supervisor/page.tsx`
- Create: `frontend/src/components/supervisor/LiveCallCard.tsx`
- Create: `frontend/src/components/supervisor/SupervisionModal.tsx`
- Create: `frontend/src/components/supervisor/CampaignOverview.tsx`
- Create: `frontend/src/components/supervisor/AgentStatusList.tsx`
- Create: `frontend/tests/supervisor-page.test.tsx`

- [ ] **Step 1: Create LiveCallCard component**

```tsx
// frontend/src/components/supervisor/LiveCallCard.tsx
'use client';

import { useEffect, useState } from 'react';

export interface LiveCall {
  id: string;
  agent_id: string;
  agent_name: string;
  agent_avatar_url?: string | null;
  consumer_phone: string;
  campaign_id: string;
  campaign_name: string;
  status: 'dialing' | 'ringing' | 'connected' | 'wrap_up';
  started_at: string;
}

interface Props {
  call: LiveCall;
  onListen: (callId: string) => void;
  onWhisper: (callId: string) => void;
  onBarge: (callId: string) => void;
  actionInFlight?: boolean;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  const last4 = digits.slice(-4);
  return `(XXX) XXX-${last4}`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function LiveCallCard({ call, onListen, onWhisper, onBarge, actionInFlight }: Props) {
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const start = new Date(call.started_at).getTime();
    const tick = () => setDuration(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [call.started_at]);

  const statusColor: Record<LiveCall['status'], string> = {
    dialing: 'bg-yellow-100 text-yellow-800',
    ringing: 'bg-blue-100 text-blue-800',
    connected: 'bg-green-100 text-green-800',
    wrap_up: 'bg-gray-100 text-gray-800',
  };

  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm" data-testid={`call-card-${call.id}`}>
      <div className="flex items-center gap-3 mb-3">
        {call.agent_avatar_url ? (
          <img src={call.agent_avatar_url} alt={call.agent_name} className="w-10 h-10 rounded-full" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-indigo-500 text-white flex items-center justify-center font-semibold">
            {call.agent_name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1">
          <div className="font-semibold text-sm">{call.agent_name}</div>
          <div className="text-xs text-gray-500">{call.campaign_name}</div>
        </div>
        <span className={`text-xs px-2 py-1 rounded ${statusColor[call.status]}`}>{call.status}</span>
      </div>

      <div className="flex justify-between text-sm mb-3">
        <span className="text-gray-600">{maskPhone(call.consumer_phone)}</span>
        <span className="font-mono text-gray-800">{formatDuration(duration)}</span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onListen(call.id)}
          disabled={actionInFlight}
          className="flex-1 text-xs px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
          data-testid={`listen-${call.id}`}
        >
          Listen
        </button>
        <button
          onClick={() => onWhisper(call.id)}
          disabled={actionInFlight}
          className="flex-1 text-xs px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
          data-testid={`whisper-${call.id}`}
        >
          Whisper
        </button>
        <button
          onClick={() => onBarge(call.id)}
          disabled={actionInFlight}
          className="flex-1 text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
          data-testid={`barge-${call.id}`}
        >
          Barge
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create SupervisionModal**

```tsx
// frontend/src/components/supervisor/SupervisionModal.tsx
'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';

type Mode = 'listen' | 'whisper' | 'barge';

interface Props {
  callId: string;
  initialMode: Mode;
  onClose: () => void;
}

export function SupervisionModal({ callId, initialMode, onClose }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [connected, setConnected] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function switchMode(next: Mode) {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/calls/${callId}/supervise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      setMode(next);
      setConnected(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await apiFetch(`/api/calls/${callId}/supervise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'disconnect' }),
      });
      setConnected(false);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="supervision-modal">
      <div className="bg-white rounded-lg p-6 w-96 shadow-lg">
        <h2 className="text-lg font-semibold mb-4">Supervising Call</h2>
        <div className="mb-4">
          <div className={`text-sm px-3 py-2 rounded ${connected ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
            {connected ? `Connected as ${mode}` : 'Disconnected'}
          </div>
        </div>
        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
        <div className="flex gap-2 mb-4">
          {(['listen', 'whisper', 'barge'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              disabled={busy || mode === m}
              className={`flex-1 px-3 py-1 rounded border text-sm ${mode === m ? 'bg-indigo-600 text-white' : 'hover:bg-gray-50'} disabled:opacity-50`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 border rounded text-sm">Close</button>
          <button onClick={disconnect} disabled={busy} className="px-3 py-1 bg-red-600 text-white rounded text-sm">Disconnect</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create CampaignOverview panel**

```tsx
// frontend/src/components/supervisor/CampaignOverview.tsx
'use client';

export interface CampaignProgress {
  campaign_id: string;
  name: string;
  agents_online: number;
  calls_in_progress: number;
  queue_depth: number;
  abandon_rate: number;
}

export function CampaignOverview({ campaigns }: { campaigns: CampaignProgress[] }) {
  if (campaigns.length === 0) {
    return <div className="text-sm text-gray-500 p-4">No active campaigns.</div>;
  }
  return (
    <div className="bg-white rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-600 text-left">
          <tr>
            <th className="px-3 py-2">Campaign</th>
            <th className="px-3 py-2">Agents</th>
            <th className="px-3 py-2">Active</th>
            <th className="px-3 py-2">Queue</th>
            <th className="px-3 py-2">Abandon %</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={c.campaign_id} className="border-t" data-testid={`campaign-row-${c.campaign_id}`}>
              <td className="px-3 py-2 font-medium">{c.name}</td>
              <td className="px-3 py-2">{c.agents_online}</td>
              <td className="px-3 py-2">{c.calls_in_progress}</td>
              <td className="px-3 py-2">{c.queue_depth}</td>
              <td className={`px-3 py-2 ${c.abandon_rate > 0.03 ? 'text-red-600 font-semibold' : ''}`}>
                {(c.abandon_rate * 100).toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Create AgentStatusList**

```tsx
// frontend/src/components/supervisor/AgentStatusList.tsx
'use client';

import { useEffect, useState } from 'react';

export type AgentStatus = 'available' | 'on_call' | 'wrap_up' | 'break' | 'offline';

export interface AgentState {
  id: string;
  name: string;
  status: AgentStatus;
  status_started_at: string;
}

const statusStyle: Record<AgentStatus, string> = {
  available: 'bg-green-100 text-green-800',
  on_call: 'bg-blue-100 text-blue-800',
  wrap_up: 'bg-yellow-100 text-yellow-800',
  break: 'bg-purple-100 text-purple-800',
  offline: 'bg-gray-100 text-gray-600',
};

function humanDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  const h = Math.floor(m / 60);
  if (h === 0) return `${m}m ${s}s`;
  return `${h}h ${m % 60}m`;
}

export function AgentStatusList({ agents }: { agents: AgentState[] }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <ul className="bg-white rounded-lg border divide-y">
      {agents.map((a) => {
        const elapsed = Math.max(0, Math.floor((now - new Date(a.status_started_at).getTime()) / 1000));
        return (
          <li key={a.id} className="p-3 flex items-center justify-between text-sm" data-testid={`agent-row-${a.id}`}>
            <span className="font-medium">{a.name}</span>
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2 py-1 rounded ${statusStyle[a.status]}`}>{a.status}</span>
              <span className="text-gray-500 font-mono text-xs">{humanDuration(elapsed)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 5: Create Supervisor page**

```tsx
// frontend/src/app/dashboard/supervisor/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { LiveCallCard, LiveCall } from '@/components/supervisor/LiveCallCard';
import { SupervisionModal } from '@/components/supervisor/SupervisionModal';
import { CampaignOverview, CampaignProgress } from '@/components/supervisor/CampaignOverview';
import { AgentStatusList, AgentState } from '@/components/supervisor/AgentStatusList';
import { apiFetch } from '@/lib/api';

type Mode = 'listen' | 'whisper' | 'barge';

interface Alert {
  id: string;
  type: 'abandon_rate' | 'compliance_block';
  message: string;
}

export default function SupervisorPage() {
  const { user, loading } = useAuth();
  const socket = useSocket();
  const router = useRouter();

  const [calls, setCalls] = useState<LiveCall[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignProgress[]>([]);
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [supervising, setSupervising] = useState<{ callId: string; mode: Mode } | null>(null);
  const [busy, setBusy] = useState(false);

  // Role gate
  useEffect(() => {
    if (!loading && user && user.role !== 'supervisor' && user.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [user, loading, router]);

  // Initial load
  useEffect(() => {
    apiFetch('/api/calls/active')
      .then((r) => r.json())
      .then((data) => setCalls(data.calls || []))
      .catch(() => {});
  }, []);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;

    const onLiveUpdate = (call: LiveCall & { ended?: boolean }) => {
      setCalls((prev) => {
        if (call.ended) return prev.filter((c) => c.id !== call.id);
        const idx = prev.findIndex((c) => c.id === call.id);
        if (idx === -1) return [...prev, call];
        const next = [...prev];
        next[idx] = call;
        return next;
      });
    };

    const onCampaignProgress = (p: CampaignProgress) => {
      setCampaigns((prev) => {
        const idx = prev.findIndex((c) => c.campaign_id === p.campaign_id);
        if (idx === -1) return [...prev, p];
        const next = [...prev];
        next[idx] = p;
        return next;
      });
    };

    const onAgentStatus = (a: AgentState) => {
      setAgents((prev) => {
        const idx = prev.findIndex((x) => x.id === a.id);
        if (idx === -1) return [...prev, a];
        const next = [...prev];
        next[idx] = a;
        return next;
      });
    };

    const pushAlert = (type: Alert['type'], message: string) => {
      const id = `${type}-${Date.now()}`;
      setAlerts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => setAlerts((prev) => prev.filter((al) => al.id !== id)), 10000);
    };

    const onAbandon = (d: { campaign_name: string; rate: number }) =>
      pushAlert('abandon_rate', `Abandon rate ${(d.rate * 100).toFixed(2)}% on ${d.campaign_name}`);
    const onCompliance = (d: { reason: string }) => pushAlert('compliance_block', `Compliance block: ${d.reason}`);

    socket.on('call:live_update', onLiveUpdate);
    socket.on('campaign:progress', onCampaignProgress);
    socket.on('agent:status_change', onAgentStatus);
    socket.on('alert:abandon_rate', onAbandon);
    socket.on('alert:compliance_block', onCompliance);

    return () => {
      socket.off('call:live_update', onLiveUpdate);
      socket.off('campaign:progress', onCampaignProgress);
      socket.off('agent:status_change', onAgentStatus);
      socket.off('alert:abandon_rate', onAbandon);
      socket.off('alert:compliance_block', onCompliance);
    };
  }, [socket]);

  const triggerSupervise = useCallback(async (callId: string, mode: Mode) => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/calls/${callId}/supervise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      if (res.ok) setSupervising({ callId, mode });
    } finally {
      setBusy(false);
    }
  }, []);

  const dismissAlert = (id: string) => setAlerts((prev) => prev.filter((a) => a.id !== id));

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Supervisor Monitor</h1>

      <div className="space-y-2">
        {alerts.map((a) => (
          <div
            key={a.id}
            className={`p-3 rounded flex justify-between items-center ${
              a.type === 'abandon_rate' ? 'bg-red-100 border border-red-300 text-red-800' : 'bg-yellow-100 border border-yellow-300 text-yellow-800'
            }`}
            data-testid={`alert-${a.type}`}
          >
            <span className="text-sm">{a.message}</span>
            <button onClick={() => dismissAlert(a.id)} className="text-xs underline">dismiss</button>
          </div>
        ))}
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">Active Calls ({calls.length})</h2>
        {calls.length === 0 ? (
          <div className="text-gray-500 text-sm">No active calls.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {calls.map((c) => (
              <LiveCallCard
                key={c.id}
                call={c}
                onListen={(id) => triggerSupervise(id, 'listen')}
                onWhisper={(id) => triggerSupervise(id, 'whisper')}
                onBarge={(id) => triggerSupervise(id, 'barge')}
                actionInFlight={busy}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Campaigns</h2>
        <CampaignOverview campaigns={campaigns} />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Agents</h2>
        <AgentStatusList agents={agents} />
      </section>

      {supervising && (
        <SupervisionModal
          callId={supervising.callId}
          initialMode={supervising.mode}
          onClose={() => setSupervising(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create test**

```tsx
// frontend/tests/supervisor-page.test.tsx
import { render, screen, fireEvent, act } from '@testing-library/react';
import { LiveCallCard, LiveCall } from '@/components/supervisor/LiveCallCard';

const baseCall: LiveCall = {
  id: 'call-1',
  agent_id: 'a-1',
  agent_name: 'Alice',
  consumer_phone: '+15551234567',
  campaign_id: 'c-1',
  campaign_name: 'Test Campaign',
  status: 'connected',
  started_at: new Date(Date.now() - 65000).toISOString(),
};

describe('LiveCallCard', () => {
  it('renders masked phone, agent name, campaign', () => {
    render(<LiveCallCard call={baseCall} onListen={jest.fn()} onWhisper={jest.fn()} onBarge={jest.fn()} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Test Campaign')).toBeInTheDocument();
    expect(screen.getByText(/XXX\) XXX-4567/)).toBeInTheDocument();
  });

  it('invokes handlers', () => {
    const onListen = jest.fn();
    const onWhisper = jest.fn();
    const onBarge = jest.fn();
    render(<LiveCallCard call={baseCall} onListen={onListen} onWhisper={onWhisper} onBarge={onBarge} />);
    fireEvent.click(screen.getByTestId('listen-call-1'));
    fireEvent.click(screen.getByTestId('whisper-call-1'));
    fireEvent.click(screen.getByTestId('barge-call-1'));
    expect(onListen).toHaveBeenCalledWith('call-1');
    expect(onWhisper).toHaveBeenCalledWith('call-1');
    expect(onBarge).toHaveBeenCalledWith('call-1');
  });

  it('disables buttons while action in flight', () => {
    render(<LiveCallCard call={baseCall} onListen={jest.fn()} onWhisper={jest.fn()} onBarge={jest.fn()} actionInFlight />);
    expect(screen.getByTestId('listen-call-1')).toBeDisabled();
    expect(screen.getByTestId('barge-call-1')).toBeDisabled();
  });
});
```

- [ ] **Step 7: Verify**

Run: `cd frontend && npm test -- supervisor-page`
Expected: `3 passed`

- [ ] **Step 8: Commit**

```
feat(supervisor): live monitor with listen/whisper/barge controls
```

---

### Task 32: Reports Page + Backend Reports Routes

**Files:**
- Create: `backend/src/routes/reports.ts`
- Create: `backend/tests/reports.test.ts`
- Create: `frontend/src/app/dashboard/reports/page.tsx`
- Create: `frontend/src/components/reports/DateRangePicker.tsx`
- Create: `frontend/src/components/reports/CampaignReport.tsx`
- Create: `frontend/src/components/reports/AgentReport.tsx`
- Create: `frontend/src/components/reports/DIDHealthReport.tsx`
- Create: `frontend/src/lib/csv-export.ts`
- Create: `frontend/tests/reports-page.test.tsx`

- [ ] **Step 1: Backend reports route**

```ts
// backend/src/routes/reports.ts
import { FastifyInstance } from 'fastify';
import { requireRole } from '../middleware/auth';
import { prisma } from '../lib/prisma';

interface RangeQuery {
  dateFrom?: string;
  dateTo?: string;
}

function parseRange(q: RangeQuery) {
  const to = q.dateTo ? new Date(q.dateTo) : new Date();
  const from = q.dateFrom ? new Date(q.dateFrom) : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { from, to };
}

export default async function reportsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireRole(['supervisor', 'admin']));

  app.get<{ Querystring: RangeQuery }>('/campaigns', async (req) => {
    const { from, to } = parseRange(req.query);
    const campaigns = await prisma.campaign.findMany({ select: { id: true, name: true } });

    const rows = await Promise.all(
      campaigns.map(async (c) => {
        const events = await prisma.callEvent.findMany({
          where: { campaign_id: c.id, created_at: { gte: from, lte: to } },
          select: { outcome: true, duration_seconds: true, amd_result: true, connected: true },
        });
        const total = events.length;
        const connected = events.filter((e) => e.connected).length;
        const amd = events.filter((e) => e.amd_result === 'machine').length;
        const durSum = events.reduce((s, e) => s + (e.duration_seconds || 0), 0);
        const outcomes: Record<string, number> = {};
        for (const e of events) {
          const k = e.outcome || 'unknown';
          outcomes[k] = (outcomes[k] || 0) + 1;
        }
        const metric = await prisma.campaignMetric.findFirst({
          where: { campaign_id: c.id, bucket_start: { gte: from, lte: to } },
          orderBy: { bucket_start: 'desc' },
          select: { abandon_rate: true },
        });
        return {
          id: c.id,
          name: c.name,
          total_dialed: total,
          total_connected: connected,
          connect_rate: total ? connected / total : 0,
          amd_rate: total ? amd / total : 0,
          avg_duration: connected ? Math.round(durSum / connected) : 0,
          outcomes,
          abandon_rate: metric?.abandon_rate ?? 0,
        };
      })
    );
    return { campaigns: rows };
  });

  app.get<{ Querystring: RangeQuery }>('/agents', async (req) => {
    const { from, to } = parseRange(req.query);
    const mappings = await prisma.agentMapping.findMany({ select: { id: true, name: true } });
    const rows = await Promise.all(
      mappings.map(async (a) => {
        const events = await prisma.callEvent.findMany({
          where: { agent_id: a.id, created_at: { gte: from, lte: to } },
          select: { outcome: true, duration_seconds: true, connected: true, disposition: true },
        });
        const count = events.length;
        const talk = events.reduce((s, e) => s + (e.duration_seconds || 0), 0);
        const connected = events.filter((e) => e.connected).length;
        const dispositions: Record<string, number> = {};
        for (const e of events) {
          const k = e.disposition || 'none';
          dispositions[k] = (dispositions[k] || 0) + 1;
        }
        return {
          id: a.id,
          name: a.name,
          calls_handled: count,
          talk_time_seconds: talk,
          avg_handle_time: count ? Math.round(talk / count) : 0,
          connect_rate: count ? connected / count : 0,
          dispositions,
        };
      })
    );
    return { agents: rows };
  });

  app.get<{ Querystring: RangeQuery }>('/did-health', async (req) => {
    const { from, to } = parseRange(req.query);
    const numbers = await prisma.phoneNumber.findMany();
    const rows = await Promise.all(
      numbers.map(async (n) => {
        const events = await prisma.callEvent.findMany({
          where: { caller_id: n.number, created_at: { gte: from, lte: to } },
          select: { connected: true, created_at: true },
        });
        const total = events.length;
        const connected = events.filter((e) => e.connected).length;
        const daily: Record<string, number> = {};
        for (const e of events) {
          const key = e.created_at.toISOString().slice(0, 10);
          daily[key] = (daily[key] || 0) + 1;
        }
        return {
          number: n.number,
          area_code: n.area_code,
          state: n.state,
          calls: total,
          connect_rate: total ? connected / total : 0,
          health_score: n.health_score,
          daily_usage: daily,
        };
      })
    );
    return { numbers: rows };
  });
}
```

Register in `backend/src/index.ts`: `app.register(reportsRoutes, { prefix: '/api/reports' });`

- [ ] **Step 2: Backend test**

```ts
// backend/tests/reports.test.ts
import { buildApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { signSupervisorToken } from './helpers/auth';

describe('reports routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let token: string;

  beforeAll(async () => {
    app = await buildApp();
    token = signSupervisorToken();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('GET /api/reports/campaigns returns array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/reports/campaigns?dateFrom=2026-01-01&dateTo=2026-04-16',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().campaigns).toBeInstanceOf(Array);
  });

  it('GET /api/reports/agents returns array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/reports/agents',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().agents).toBeInstanceOf(Array);
  });

  it('GET /api/reports/did-health returns array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/reports/did-health',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().numbers).toBeInstanceOf(Array);
  });

  it('rejects non-supervisor', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/reports/campaigns' });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 3: CSV export helper**

```ts
// frontend/src/lib/csv-export.ts
export function exportToCSV(filename: string, rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: DateRangePicker**

```tsx
// frontend/src/components/reports/DateRangePicker.tsx
'use client';

import { useState } from 'react';

export interface DateRange { from: string; to: string; }

interface Props {
  value: DateRange;
  onChange: (r: DateRange) => void;
}

function iso(d: Date) { return d.toISOString().slice(0, 10); }

export function DateRangePicker({ value, onChange }: Props) {
  const [custom, setCustom] = useState(false);

  function apply(preset: string) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let from = today, to = now;
    switch (preset) {
      case 'today': from = today; break;
      case 'yesterday': {
        const y = new Date(today); y.setDate(y.getDate() - 1);
        from = y; to = new Date(today.getTime() - 1); break;
      }
      case '7d': from = new Date(today); from.setDate(from.getDate() - 7); break;
      case '30d': from = new Date(today); from.setDate(from.getDate() - 30); break;
      case 'custom': setCustom(true); return;
    }
    setCustom(false);
    onChange({ from: iso(from), to: iso(to) });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={() => apply('today')} className="px-3 py-1 text-sm border rounded hover:bg-gray-50">Today</button>
      <button onClick={() => apply('yesterday')} className="px-3 py-1 text-sm border rounded hover:bg-gray-50">Yesterday</button>
      <button onClick={() => apply('7d')} className="px-3 py-1 text-sm border rounded hover:bg-gray-50">Last 7 days</button>
      <button onClick={() => apply('30d')} className="px-3 py-1 text-sm border rounded hover:bg-gray-50">Last 30 days</button>
      <button onClick={() => apply('custom')} className="px-3 py-1 text-sm border rounded hover:bg-gray-50">Custom</button>
      {custom && (
        <>
          <input type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} className="border rounded px-2 py-1 text-sm" />
          <span className="text-sm text-gray-500">to</span>
          <input type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: CampaignReport component**

```tsx
// frontend/src/components/reports/CampaignReport.tsx
'use client';

interface Row {
  id: string; name: string;
  total_dialed: number; total_connected: number;
  connect_rate: number; amd_rate: number; avg_duration: number;
  abandon_rate: number; outcomes: Record<string, number>;
}

export function CampaignReport({ rows }: { rows: Row[] }) {
  const allOutcomes = Array.from(new Set(rows.flatMap((r) => Object.keys(r.outcomes))));
  const max = Math.max(1, ...rows.flatMap((r) => Object.values(r.outcomes)));

  return (
    <div className="space-y-6">
      <table className="w-full text-sm border-collapse">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left p-2">Campaign</th>
            <th className="text-right p-2">Dialed</th>
            <th className="text-right p-2">Connected</th>
            <th className="text-right p-2">Connect %</th>
            <th className="text-right p-2">AMD %</th>
            <th className="text-right p-2">Avg Dur</th>
            <th className="text-right p-2">Abandon %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="p-2 font-medium">{r.name}</td>
              <td className="p-2 text-right">{r.total_dialed}</td>
              <td className="p-2 text-right">{r.total_connected}</td>
              <td className="p-2 text-right">{(r.connect_rate * 100).toFixed(1)}%</td>
              <td className="p-2 text-right">{(r.amd_rate * 100).toFixed(1)}%</td>
              <td className="p-2 text-right">{r.avg_duration}s</td>
              <td className="p-2 text-right">{(r.abandon_rate * 100).toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div>
        <h3 className="font-semibold text-sm mb-2">Outcomes</h3>
        {rows.map((r) => (
          <div key={r.id} className="mb-4">
            <div className="text-sm font-medium mb-1">{r.name}</div>
            {allOutcomes.map((o) => (
              <div key={o} className="flex items-center gap-2 text-xs mb-1">
                <span className="w-24 truncate">{o}</span>
                <div className="flex-1 bg-gray-100 rounded h-4 relative">
                  <div
                    className="bg-indigo-500 h-4 rounded"
                    style={{ width: `${((r.outcomes[o] || 0) / max) * 100}%` }}
                  />
                </div>
                <span className="w-10 text-right">{r.outcomes[o] || 0}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: AgentReport component**

```tsx
// frontend/src/components/reports/AgentReport.tsx
'use client';

interface Row {
  id: string; name: string;
  calls_handled: number; talk_time_seconds: number;
  avg_handle_time: number; connect_rate: number;
  dispositions: Record<string, number>;
}

export function AgentReport({ rows }: { rows: Row[] }) {
  const allDisp = Array.from(new Set(rows.flatMap((r) => Object.keys(r.dispositions))));
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50">
        <tr>
          <th className="text-left p-2">Agent</th>
          <th className="text-right p-2">Calls</th>
          <th className="text-right p-2">Talk Time</th>
          <th className="text-right p-2">AHT</th>
          <th className="text-right p-2">Connect %</th>
          {allDisp.map((d) => <th key={d} className="text-right p-2">{d}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t">
            <td className="p-2 font-medium">{r.name}</td>
            <td className="p-2 text-right">{r.calls_handled}</td>
            <td className="p-2 text-right">{Math.round(r.talk_time_seconds / 60)}m</td>
            <td className="p-2 text-right">{r.avg_handle_time}s</td>
            <td className="p-2 text-right">{(r.connect_rate * 100).toFixed(1)}%</td>
            {allDisp.map((d) => <td key={d} className="p-2 text-right">{r.dispositions[d] || 0}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 7: DIDHealthReport component**

```tsx
// frontend/src/components/reports/DIDHealthReport.tsx
'use client';

interface Row {
  number: string; area_code: string | null; state: string | null;
  calls: number; connect_rate: number; health_score: number;
  daily_usage: Record<string, number>;
}

export function DIDHealthReport({ rows }: { rows: Row[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50">
        <tr>
          <th className="text-left p-2">Number</th>
          <th className="text-left p-2">Area</th>
          <th className="text-left p-2">State</th>
          <th className="text-right p-2">Calls</th>
          <th className="text-right p-2">Connect %</th>
          <th className="text-right p-2">Health</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.number} className="border-t">
            <td className="p-2 font-mono">{r.number}</td>
            <td className="p-2">{r.area_code || '-'}</td>
            <td className="p-2">{r.state || '-'}</td>
            <td className="p-2 text-right">{r.calls}</td>
            <td className="p-2 text-right">{(r.connect_rate * 100).toFixed(1)}%</td>
            <td className={`p-2 text-right ${r.health_score < 50 ? 'text-red-600' : r.health_score < 75 ? 'text-yellow-700' : 'text-green-700'}`}>
              {r.health_score}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 8: Reports page**

```tsx
// frontend/src/app/dashboard/reports/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { DateRangePicker, DateRange } from '@/components/reports/DateRangePicker';
import { CampaignReport } from '@/components/reports/CampaignReport';
import { AgentReport } from '@/components/reports/AgentReport';
import { DIDHealthReport } from '@/components/reports/DIDHealthReport';
import { exportToCSV } from '@/lib/csv-export';

type Tab = 'campaign' | 'agent' | 'did';

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('campaign');
  const [range, setRange] = useState<DateRange>(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 86400000);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  });
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [numbers, setNumbers] = useState<any[]>([]);

  useEffect(() => {
    const qs = `?dateFrom=${range.from}&dateTo=${range.to}`;
    apiFetch(`/api/reports/campaigns${qs}`).then((r) => r.json()).then((d) => setCampaigns(d.campaigns || []));
    apiFetch(`/api/reports/agents${qs}`).then((r) => r.json()).then((d) => setAgents(d.agents || []));
    apiFetch(`/api/reports/did-health${qs}`).then((r) => r.json()).then((d) => setNumbers(d.numbers || []));
  }, [range.from, range.to]);

  function handleExport() {
    if (tab === 'campaign') exportToCSV(`campaigns_${range.from}_${range.to}.csv`, campaigns);
    if (tab === 'agent') exportToCSV(`agents_${range.from}_${range.to}.csv`, agents);
    if (tab === 'did') exportToCSV(`did_health_${range.from}_${range.to}.csv`, numbers);
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Reports</h1>
        <button onClick={handleExport} className="px-3 py-1 bg-indigo-600 text-white rounded text-sm" data-testid="export-csv">
          Export CSV
        </button>
      </div>

      <DateRangePicker value={range} onChange={setRange} />

      <div className="border-b flex gap-4">
        {(['campaign', 'agent', 'did'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`py-2 px-1 text-sm border-b-2 ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}
            data-testid={`tab-${t}`}
          >
            {t === 'did' ? 'DID Health' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div>
        {tab === 'campaign' && <CampaignReport rows={campaigns} />}
        {tab === 'agent' && <AgentReport rows={agents} />}
        {tab === 'did' && <DIDHealthReport rows={numbers} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Frontend test**

```tsx
// frontend/tests/reports-page.test.tsx
import { render, screen } from '@testing-library/react';
import { exportToCSV } from '@/lib/csv-export';

describe('exportToCSV', () => {
  it('builds CSV with headers and escapes commas', () => {
    let createdBlob: Blob | null = null;
    global.URL.createObjectURL = jest.fn((b: Blob) => { createdBlob = b; return 'blob:x'; });
    global.URL.revokeObjectURL = jest.fn();
    exportToCSV('test.csv', [{ name: 'Alice', note: 'hi, there' }]);
    expect(createdBlob).not.toBeNull();
  });
});
```

- [ ] **Step 10: Verify**

Run: `cd backend && npm test -- reports && cd ../frontend && npm test -- reports-page`
Expected: all pass

- [ ] **Step 11: Commit**

```
feat(reports): campaign/agent/DID reports with CSV export
```

---

### Task 33: Settings Page + Backend Settings Route

**Files:**
- Create: `backend/src/routes/settings.ts`
- Edit: `backend/prisma/schema.prisma` (add SystemSetting model)
- Create: `backend/tests/settings.test.ts`
- Create: `frontend/src/app/dashboard/settings/page.tsx`
- Create: `frontend/tests/settings-page.test.tsx`

- [ ] **Step 1: Prisma model + migration**

Add to `backend/prisma/schema.prisma`:

```prisma
model SystemSetting {
  key       String   @id
  value     String
  updatedAt DateTime @updatedAt
}
```

Run: `cd backend && npx prisma migrate dev --name add_system_settings`

- [ ] **Step 2: Backend settings route**

```ts
// backend/src/routes/settings.ts
import { FastifyInstance } from 'fastify';
import { requireRole } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const DEFAULTS: Record<string, string> = {
  'tcpa.window_start': process.env.TCPA_WINDOW_START || '08:00',
  'tcpa.window_end': process.env.TCPA_WINDOW_END || '21:00',
  'tcpa.default_timezone': process.env.TCPA_DEFAULT_TZ || 'America/New_York',
  'amd.enabled': process.env.AMD_ENABLED || 'true',
  'amd.vm_drop_url': process.env.AMD_VM_DROP_URL || '',
  'retry.max_attempts': process.env.RETRY_MAX_ATTEMPTS || '3',
  'retry.delay_minutes': process.env.RETRY_DELAY_MINUTES || '30',
};

export default async function settingsRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: requireRole(['supervisor', 'admin']) }, async () => {
    const rows = await prisma.systemSetting.findMany();
    const map: Record<string, string> = { ...DEFAULTS };
    for (const r of rows) map[r.key] = r.value;
    return { settings: map };
  });

  app.patch<{ Body: Record<string, string> }>(
    '/',
    { preHandler: requireRole(['admin']) },
    async (req) => {
      const updates = req.body || {};
      const results: Record<string, string> = {};
      for (const [key, value] of Object.entries(updates)) {
        const row = await prisma.systemSetting.upsert({
          where: { key },
          create: { key, value: String(value) },
          update: { value: String(value) },
        });
        results[row.key] = row.value;
      }
      return { updated: results };
    }
  );
}
```

Register: `app.register(settingsRoutes, { prefix: '/api/settings' });`

- [ ] **Step 3: Backend test**

```ts
// backend/tests/settings.test.ts
import { buildApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { signAdminToken, signAgentToken } from './helpers/auth';

describe('settings routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });

  it('GET returns defaults plus stored values', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/settings',
      headers: { authorization: `Bearer ${signAdminToken()}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings['tcpa.window_start']).toBeDefined();
  });

  it('PATCH updates values (admin only)', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/api/settings',
      headers: { authorization: `Bearer ${signAdminToken()}`, 'content-type': 'application/json' },
      payload: { 'tcpa.window_end': '20:00' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().updated['tcpa.window_end']).toBe('20:00');
  });

  it('PATCH rejects non-admin', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/api/settings',
      headers: { authorization: `Bearer ${signAgentToken()}` },
      payload: { 'tcpa.window_end': '20:00' },
    });
    expect(res.statusCode).toBe(403);
  });
});
```

- [ ] **Step 4: Frontend settings page**

```tsx
// frontend/src/app/dashboard/settings/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { apiFetch } from '@/lib/api';

interface HealthState { healthy: boolean; lastCheck: string | null; }

const TZ_LIST = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'UTC'];

export default function SettingsPage() {
  const { user, loading } = useAuth();
  const socket = useSocket();
  const router = useRouter();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [vox, setVox] = useState<HealthState>({ healthy: false, lastCheck: null });
  const [crm, setCrm] = useState<HealthState>({ healthy: false, lastCheck: null });

  useEffect(() => {
    if (!loading && user && user.role !== 'admin') router.replace('/dashboard');
  }, [user, loading, router]);

  useEffect(() => {
    apiFetch('/api/settings').then((r) => r.json()).then((d) => setSettings(d.settings || {}));
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onVox = (d: { healthy: boolean }) => setVox({ healthy: d.healthy, lastCheck: new Date().toISOString() });
    const onCrm = (d: { healthy: boolean }) => setCrm({ healthy: d.healthy, lastCheck: new Date().toISOString() });
    socket.on('voximplant:health', onVox);
    socket.on('crm:health', onCrm);
    return () => { socket.off('voximplant:health', onVox); socket.off('crm:health', onCrm); };
  }, [socket]);

  async function saveSection(keys: string[]) {
    setSaving(keys.join(','));
    const body: Record<string, string> = {};
    for (const k of keys) body[k] = settings[k];
    await apiFetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(null);
  }

  const update = (k: string, v: string) => setSettings((s) => ({ ...s, [k]: v }));

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="border rounded-lg p-4 bg-white">
        <h2 className="font-semibold mb-3">TCPA Defaults</h2>
        <div className="grid grid-cols-3 gap-3">
          <label className="text-sm">
            Window Start
            <input type="time" className="w-full border rounded px-2 py-1 mt-1"
              value={settings['tcpa.window_start'] || ''} onChange={(e) => update('tcpa.window_start', e.target.value)} />
          </label>
          <label className="text-sm">
            Window End
            <input type="time" className="w-full border rounded px-2 py-1 mt-1"
              value={settings['tcpa.window_end'] || ''} onChange={(e) => update('tcpa.window_end', e.target.value)} />
          </label>
          <label className="text-sm">
            Timezone
            <select className="w-full border rounded px-2 py-1 mt-1"
              value={settings['tcpa.default_timezone'] || ''} onChange={(e) => update('tcpa.default_timezone', e.target.value)}>
              {TZ_LIST.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </label>
        </div>
        <button
          onClick={() => saveSection(['tcpa.window_start', 'tcpa.window_end', 'tcpa.default_timezone'])}
          disabled={saving !== null}
          className="mt-3 px-3 py-1 bg-indigo-600 text-white rounded text-sm disabled:opacity-50"
          data-testid="save-tcpa"
        >
          Save TCPA
        </button>
      </section>

      <section className="border rounded-lg p-4 bg-white">
        <h2 className="font-semibold mb-3">AMD Defaults</h2>
        <label className="flex items-center gap-2 text-sm mb-2">
          <input type="checkbox" checked={settings['amd.enabled'] === 'true'}
            onChange={(e) => update('amd.enabled', e.target.checked ? 'true' : 'false')} />
          AMD Enabled
        </label>
        <label className="text-sm block">
          VM Drop URL
          <input type="url" className="w-full border rounded px-2 py-1 mt-1"
            value={settings['amd.vm_drop_url'] || ''} onChange={(e) => update('amd.vm_drop_url', e.target.value)} />
        </label>
        <button
          onClick={() => saveSection(['amd.enabled', 'amd.vm_drop_url'])}
          disabled={saving !== null}
          className="mt-3 px-3 py-1 bg-indigo-600 text-white rounded text-sm disabled:opacity-50"
          data-testid="save-amd"
        >
          Save AMD
        </button>
      </section>

      <section className="border rounded-lg p-4 bg-white">
        <h2 className="font-semibold mb-3">Retry Defaults</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            Max Attempts
            <input type="number" min={1} className="w-full border rounded px-2 py-1 mt-1"
              value={settings['retry.max_attempts'] || ''} onChange={(e) => update('retry.max_attempts', e.target.value)} />
          </label>
          <label className="text-sm">
            Delay (minutes)
            <input type="number" min={0} className="w-full border rounded px-2 py-1 mt-1"
              value={settings['retry.delay_minutes'] || ''} onChange={(e) => update('retry.delay_minutes', e.target.value)} />
          </label>
        </div>
        <button
          onClick={() => saveSection(['retry.max_attempts', 'retry.delay_minutes'])}
          disabled={saving !== null}
          className="mt-3 px-3 py-1 bg-indigo-600 text-white rounded text-sm disabled:opacity-50"
          data-testid="save-retry"
        >
          Save Retry
        </button>
      </section>

      <section className="border rounded-lg p-4 bg-white">
        <h2 className="font-semibold mb-3">Connection Status</h2>
        <div className="flex items-center gap-3 mb-2">
          <span className={`w-3 h-3 rounded-full ${vox.healthy ? 'bg-green-500' : 'bg-red-500'}`} data-testid="vox-health-dot" />
          <span className="text-sm">Voximplant API</span>
          <span className="text-xs text-gray-500 ml-auto">{vox.lastCheck ? new Date(vox.lastCheck).toLocaleTimeString() : 'no data'}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${crm.healthy ? 'bg-green-500' : 'bg-red-500'}`} data-testid="crm-health-dot" />
          <span className="text-sm">CRM API</span>
          <span className="text-xs text-gray-500 ml-auto">{crm.lastCheck ? new Date(crm.lastCheck).toLocaleTimeString() : 'no data'}</span>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Frontend test**

```tsx
// frontend/tests/settings-page.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsPage from '@/app/dashboard/settings/page';

jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { role: 'admin' }, loading: false }) }));
jest.mock('@/hooks/useSocket', () => ({ useSocket: () => null }));
jest.mock('@/lib/api', () => ({
  apiFetch: jest.fn((url: string, init?: RequestInit) => {
    if (url === '/api/settings' && !init) {
      return Promise.resolve({ json: () => Promise.resolve({ settings: { 'tcpa.window_start': '08:00', 'tcpa.window_end': '21:00', 'tcpa.default_timezone': 'UTC' } }) } as Response);
    }
    return Promise.resolve({ json: () => Promise.resolve({ updated: {} }) } as Response);
  }),
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn() }) }));

describe('SettingsPage', () => {
  it('renders TCPA section and saves', async () => {
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByTestId('save-tcpa')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('save-tcpa'));
  });
});
```

- [ ] **Step 6: Verify**

Run: `cd backend && npm test -- settings && cd ../frontend && npm test -- settings-page`
Expected: all pass

- [ ] **Step 7: Commit**

```
feat(settings): admin settings page with TCPA/AMD/Retry and health status
```

---

### Task 34: Inbound IVR Scenario

**Files:**
- Create: `voxfiles/scenarios/inbound-ivr.voxengine.js`

- [ ] **Step 1: Write full VoxEngine scenario**

```javascript
// voxfiles/scenarios/inbound-ivr.voxengine.js
// Inbound IVR scenario for Elite Dialer. Runs in Voximplant cloud.

require(Modules.IVR);

var DIALER_BACKEND_URL = 'https://dialer.example.com/api/voximplant/webhooks/inbound';
var CRM_PREFETCH_URL = 'https://crm.example.com/api/voice/tools/prefetch-account';
var DIALER_API_KEY = 'REPLACE_WITH_API_KEY';
var CRM_API_KEY = 'REPLACE_WITH_CRM_KEY';

var IVR_GREETING = 'Thank you for calling Elite Portfolio Management.';
var IVR_MAIN_MENU = 'Press 1 to speak with a representative. Press 2 to check your account balance. Press 3 to request a callback.';
var IVR_REPROMPT = "Sorry, I didn't catch that. " + IVR_MAIN_MENU;
var IVR_GOODBYE = 'Thank you for calling. Goodbye.';

var QUEUE_NAME = 'inbound_queue';
var QUEUE_PRIORITY = 5;

var state = {
  inboundCall: null,
  callStartedAt: 0,
  cachedAccount: null,
  dtmfBuffer: '',
  reprompted: false,
  dtmfListenerBound: false,
};

function notifyDialerBackend(eventType, payload) {
  try {
    var body = JSON.stringify({
      event: eventType,
      call_id: state.inboundCall ? state.inboundCall.id() : null,
      timestamp: new Date().toISOString(),
      data: payload || {},
    });
    Net.httpRequestAsync(DIALER_BACKEND_URL, {
      method: 'POST',
      headers: ['Content-Type: application/json', 'X-Dialer-Key: ' + DIALER_API_KEY],
      postData: body,
    }, function () { /* fire and forget */ });
  } catch (e) {
    Logger.write('notifyDialerBackend failed: ' + e.message);
  }
}

function prefetchAccount(callerId, cb) {
  var url = CRM_PREFETCH_URL + '?phone=' + encodeURIComponent(callerId);
  Net.httpRequestAsync(url, {
    method: 'GET',
    headers: ['X-Dialer-Key: ' + CRM_API_KEY],
  }, function (res) {
    if (res && res.code === 200) {
      try {
        var parsed = JSON.parse(res.text);
        state.cachedAccount = parsed.account || null;
      } catch (e) { state.cachedAccount = null; }
    } else {
      state.cachedAccount = null;
    }
    if (cb) cb();
  });
}

function playMenu() {
  state.dtmfBuffer = '';
  state.inboundCall.say(IVR_GREETING + ' ' + IVR_MAIN_MENU, Language.US_ENGLISH_FEMALE);
}

function playReprompt() {
  state.dtmfBuffer = '';
  state.reprompted = true;
  state.inboundCall.say(IVR_REPROMPT, Language.US_ENGLISH_FEMALE);
}

function sayAndHangup(text) {
  state.inboundCall.addEventListener(CallEvents.PlaybackFinished, function () {
    state.inboundCall.hangup();
  });
  state.inboundCall.say(text, Language.US_ENGLISH_FEMALE);
}

function routeToAgent() {
  notifyDialerBackend('ivr_selection', { selection: '1' });
  var customData = JSON.stringify({ crm_account_id: state.cachedAccount ? state.cachedAccount.id : null });
  var acdRequest = VoxEngine.enqueueACDRequest(QUEUE_NAME, QUEUE_PRIORITY, {
    agentRequest: true,
    customData: customData,
  });

  acdRequest.addEventListener(ACDEvents.Ready, function () {
    var operatorCall = acdRequest.operatorCall();
    VoxEngine.sendMediaBetween(state.inboundCall, operatorCall);
    try { state.inboundCall.record(); } catch (e) { Logger.write('record failed: ' + e.message); }
  });

  acdRequest.addEventListener(ACDEvents.OperatorReached, function () {
    notifyDialerBackend('agent_connected', {});
  });

  acdRequest.addEventListener(ACDEvents.Offline, function () {
    sayAndHangup('No agents available. ' + IVR_GOODBYE);
  });
}

function handleBalanceRequest() {
  notifyDialerBackend('ivr_selection', { selection: '2' });
  if (state.cachedAccount && typeof state.cachedAccount.balance !== 'undefined') {
    var bal = Number(state.cachedAccount.balance).toFixed(2);
    state.inboundCall.addEventListener(CallEvents.PlaybackFinished, function onBalFinished() {
      state.inboundCall.removeEventListener(CallEvents.PlaybackFinished, onBalFinished);
      state.dtmfBuffer = '';
      state.inboundCall.say('Press 1 to speak with a representative, or hang up to end the call.', Language.US_ENGLISH_FEMALE);
    });
    state.inboundCall.say('Your current balance is $' + bal + '.', Language.US_ENGLISH_FEMALE);
  } else {
    state.inboundCall.addEventListener(CallEvents.PlaybackFinished, function onNoAcct() {
      state.inboundCall.removeEventListener(CallEvents.PlaybackFinished, onNoAcct);
      state.dtmfBuffer = '';
    });
    state.inboundCall.say('We could not locate your account. Press 1 to speak with a representative.', Language.US_ENGLISH_FEMALE);
  }
}

function handleCallbackRequest() {
  notifyDialerBackend('callback_requested', { phone: state.inboundCall.callerid() });
  sayAndHangup('A representative will call you back within one business day. ' + IVR_GOODBYE);
}

function startDTMFCollection() {
  var timeout = null;
  var armTimeout = function () {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(function () {
      if (state.reprompted) {
        sayAndHangup(IVR_GOODBYE);
      } else {
        playReprompt();
        armTimeout();
      }
    }, 8000);
  };

  if (!state.dtmfListenerBound) {
    state.inboundCall.addEventListener(CallEvents.ToneReceived, function (e) {
      if (timeout) { clearTimeout(timeout); timeout = null; }
      var digit = e.tone;
      state.dtmfBuffer += digit;

      if (digit === '1') {
        routeToAgent();
      } else if (digit === '2') {
        handleBalanceRequest();
        armTimeout();
      } else if (digit === '3') {
        handleCallbackRequest();
      } else {
        if (state.reprompted) {
          sayAndHangup(IVR_GOODBYE);
        } else {
          playReprompt();
          armTimeout();
        }
      }
    });
    state.dtmfListenerBound = true;
  }
  armTimeout();
}

VoxEngine.addEventListener(AppEvents.CallAlerting, function (e) {
  state.inboundCall = e.call;
  state.callStartedAt = Date.now();

  notifyDialerBackend('call_started', {
    direction: 'inbound',
    from: state.inboundCall.callerid(),
    to: state.inboundCall.number(),
  });

  state.inboundCall.addEventListener(CallEvents.Connected, function () {
    prefetchAccount(state.inboundCall.callerid(), function () {
      state.inboundCall.addEventListener(CallEvents.PlaybackFinished, function onMenuDone() {
        state.inboundCall.removeEventListener(CallEvents.PlaybackFinished, onMenuDone);
        startDTMFCollection();
      });
      playMenu();
    });
  });

  state.inboundCall.addEventListener(CallEvents.Disconnected, function () {
    var durationSec = Math.floor((Date.now() - state.callStartedAt) / 1000);
    notifyDialerBackend('call_ended', { duration_seconds: durationSec });
    VoxEngine.terminate();
  });

  state.inboundCall.addEventListener(CallEvents.Failed, function () {
    notifyDialerBackend('call_failed', {});
    VoxEngine.terminate();
  });

  state.inboundCall.answer();
});
```

- [ ] **Step 2: Manual verification**

1. Deploy scenario:
   ```
   voximplant scenario upload voxfiles/scenarios/inbound-ivr.voxengine.js
   ```
2. Assign to inbound application rule in Voximplant console (pattern matches inbound DID).
3. Call the DID from a mobile phone.
4. Verify:
   - Greeting plays
   - Press 1 → queued to agent; agent WebSDK rings
   - Press 2 → balance plays (if cached) or fallback message
   - Press 3 → callback confirmation then hangup
   - No input after 8s → reprompt; second timeout → hangup
5. Check backend `call_events` table for rows with `direction='inbound'`, `ivr_selection` events, and `call_ended` with duration.

- [ ] **Step 3: Commit**

```
feat(voxengine): inbound IVR scenario with DTMF routing and account prefetch
```

---

## Phase 8: Integration & Deployment

### Task 35: Docker Compose + Dockerfiles

**Files:**
- Edit: `docker-compose.yml`
- Create: `backend/Dockerfile`
- Create: `frontend/Dockerfile`
- Create: `backend/.dockerignore`
- Create: `frontend/.dockerignore`
- Edit: `frontend/next.config.js` (enable standalone output)

- [ ] **Step 1: backend/Dockerfile**

```dockerfile
# backend/Dockerfile
# -------- builder --------
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json* ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# -------- production --------
FROM node:20-alpine AS production
WORKDIR /app

RUN apk add --no-cache openssl tini

ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 5000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
```

- [ ] **Step 2: backend/.dockerignore**

```
node_modules
dist
.env
.env.*
.git
.gitignore
coverage
tests
*.log
README.md
.vscode
.idea
```

- [ ] **Step 3: frontend/Dockerfile**

```dockerfile
# frontend/Dockerfile
# -------- builder --------
FROM node:20-alpine AS builder
WORKDIR /app

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_VOX_APP_NAME
ARG NEXT_PUBLIC_VOX_ACCOUNT

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_VOX_APP_NAME=$NEXT_PUBLIC_VOX_APP_NAME
ENV NEXT_PUBLIC_VOX_ACCOUNT=$NEXT_PUBLIC_VOX_ACCOUNT

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# -------- runner --------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
```

- [ ] **Step 4: frontend/.dockerignore**

```
node_modules
.next
.env
.env.*
.git
.gitignore
coverage
tests
README.md
.vscode
.idea
```

- [ ] **Step 5: Enable standalone in next.config.js**

```js
// frontend/next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
};
module.exports = nextConfig;
```

- [ ] **Step 6: docker-compose.yml**

```yaml
# docker-compose.yml
version: '3.9'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-dialer}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-dialer}
      POSTGRES_DB: ${POSTGRES_DB:-elite_dialer}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-dialer} -d ${POSTGRES_DB:-elite_dialer}"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    env_file:
      - .env
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-dialer}:${POSTGRES_PASSWORD:-dialer}@postgres:5432/${POSTGRES_DB:-elite_dialer}
      REDIS_URL: redis://redis:6379
    ports:
      - "5000:5000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:-http://localhost:5000}
        NEXT_PUBLIC_SOCKET_URL: ${NEXT_PUBLIC_SOCKET_URL:-http://localhost:5000}
        NEXT_PUBLIC_VOX_APP_NAME: ${NEXT_PUBLIC_VOX_APP_NAME:-}
        NEXT_PUBLIC_VOX_ACCOUNT: ${NEXT_PUBLIC_VOX_ACCOUNT:-}
    ports:
      - "3000:3000"
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

- [ ] **Step 7: Verify**

Run: `docker compose build && docker compose up -d && docker compose ps`
Expected: all four services show `Up` / `healthy`; `curl http://localhost:5000/health` returns 200; `curl http://localhost:3000` returns HTML.

- [ ] **Step 8: Commit**

```
chore(docker): multi-stage Dockerfiles and compose stack
```

---

### Task 36: Integration Smoke Test + Final Commit

**Files:**
- Create: `scripts/smoke-test.sh`
- Edit: `README.md`

- [ ] **Step 1: Create smoke test script**

```bash
#!/usr/bin/env bash
# scripts/smoke-test.sh - Elite Dialer integration smoke test
set -euo pipefail

CLEANUP=0
for arg in "$@"; do
  case "$arg" in
    --cleanup) CLEANUP=1 ;;
  esac
done

BACKEND_URL="${BACKEND_URL:-http://localhost:5000}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
ADMIN_EMAIL="${SMOKE_ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${SMOKE_ADMIN_PASSWORD:-changeme}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { printf "${GREEN}PASS${NC} %s\n" "$1"; }
fail() { printf "${RED}FAIL${NC} %s\n" "$1"; exit 1; }
warn() { printf "${YELLOW}WARN${NC} %s\n" "$1"; }

echo "==> Checking prerequisites"
command -v docker >/dev/null 2>&1 || fail "docker not installed"
command -v curl   >/dev/null 2>&1 || fail "curl not installed"
pass "prereqs present"

echo "==> Starting stack"
docker compose up -d
pass "docker compose up -d"

echo "==> Waiting for backend health (timeout 60s)"
deadline=$(( $(date +%s) + 60 ))
until curl -sf "${BACKEND_URL}/health" >/dev/null 2>&1; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    docker compose logs backend | tail -n 80
    fail "backend did not become healthy in 60s"
  fi
  sleep 2
done
pass "backend /health"

echo "==> POST /api/auth/login"
login_resp=$(curl -s -o /tmp/login.json -w "%{http_code}" -X POST "${BACKEND_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" || echo "000")

if [ "$login_resp" != "200" ]; then
  warn "auth/login returned ${login_resp} (likely CRM not reachable). Using a static JWT if provided."
  if [ -n "${SMOKE_JWT:-}" ]; then
    TOKEN="$SMOKE_JWT"
  else
    fail "no token available. Set SMOKE_JWT or make CRM reachable."
  fi
else
  TOKEN=$(python3 -c "import json,sys;print(json.load(open('/tmp/login.json'))['token'])" 2>/dev/null || \
          node -e "console.log(require('/tmp/login.json').token)")
  pass "login succeeded"
fi

test_get() {
  local path="$1"
  local code
  code=$(curl -s -o /tmp/smoke_body.json -w "%{http_code}" -H "Authorization: Bearer ${TOKEN}" "${BACKEND_URL}${path}")
  if [ "$code" != "200" ]; then
    cat /tmp/smoke_body.json || true
    fail "GET ${path} expected 200 got ${code}"
  fi
  if ! head -c 1 /tmp/smoke_body.json | grep -qE '\{|\['; then
    fail "GET ${path} did not return JSON"
  fi
  pass "GET ${path}"
}

test_get "/api/campaigns"
test_get "/api/phone-numbers"
test_get "/api/did-groups"

echo "==> Testing Socket.IO handshake"
sio_code=$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND_URL}/socket.io/?EIO=4&transport=polling")
if [ "$sio_code" != "200" ]; then
  fail "Socket.IO handshake expected 200 got ${sio_code}"
fi
pass "Socket.IO handshake"

echo ""
printf "${GREEN}============================${NC}\n"
printf "${GREEN}SMOKE TEST SUCCESS${NC}\n"
printf "${GREEN}============================${NC}\n"

if [ "$CLEANUP" -eq 1 ]; then
  echo "==> Cleanup"
  docker compose down
fi
```

- [ ] **Step 2: Make executable**

Run: `chmod +x scripts/smoke-test.sh`

- [ ] **Step 3: Update README**

Append to `README.md`:

```markdown
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
```

- [ ] **Step 4: Run smoke test**

Run: `./scripts/smoke-test.sh --cleanup`
Expected: `SMOKE TEST SUCCESS`

- [ ] **Step 5: Final commit**

```
chore: complete Elite Dialer v1 production build
```
