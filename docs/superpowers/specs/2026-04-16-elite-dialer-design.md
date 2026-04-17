# Elite Dialer — Production Voice Communication Platform

## Design Specification

**Date:** 2026-04-16
**Status:** Approved
**Replaces:** TCN dialer + Retell AI voice agent system
**Scope:** Standalone dialer app integrated with Elite Portfolio CRM via API

---

## 1. System Architecture & Boundaries

### Overview

Two systems with clear responsibilities:

- **Elite Dialer (this app)** — owns Voximplant orchestration, campaign management, softphone UI, VoxEngine scenarios, DID management, real-time call state, supervisor monitoring, and reporting dashboards.
- **Elite Portfolio CRM (existing, live production)** — owns account/debt data, payment processing, compliance history, call outcome logging, guided call workflow, activity log, DNC list, status triggers, payment plans, and USAePay tokenization.

The dialer integrates with the CRM via REST API. The CRM is the source of truth for all business data.

### Voximplant Platform (Native Features Used)

- **SmartQueue PDS** — predictive and progressive dialing engine with abandon rate control
- **Call Lists API** — CSV upload, auto-dial, retry logic, scheduling
- **WebSDK** — WebRTC softphone for agent browsers
- **VoxEngine** — cloud-executed JavaScript for call control logic
- **AMD Module** — answering machine detection (99% accuracy)
- **Recorder Module** — MP3 recording to S3
- **Caller ID Shuffler** — native rotation + neighborhood dialing
- **Phone Numbers API** — DID provisioning in 60+ countries
- **SmartQueue Supervision** — native listen/whisper/barge
- **IVR Module** — programmatic DTMF collection + TTS

### Dialer Database (Intentionally Thin)

The dialer stores only:
- Campaign configuration (mode, schedule, DID groups, pacing params)
- Agent-to-Voximplant user mapping
- DID groups and phone number health tracking
- Campaign contacts (local copy for high-velocity dialing)
- Call events (raw telephony records, synced to CRM asynchronously)
- Agent status log (for handle time reporting)

Everything else — accounts, contacts, payments, compliance, call history, dispositions — stays in the CRM.

### CRM Integration Points

**Dialer backend calls CRM:**

| When | Endpoint | Purpose |
|------|----------|---------|
| Campaign populate | `GET /api/voice/campaigns/[id]/accounts` | Pull contact list from CRM worklist |
| Account detail | `GET /api/work/[id]` | Fetch account for screen pop / compliance check |
| DNC check | `GET /api/voice/dnc?phone=` | Check Do Not Call list |
| TCPA/Reg F check | `GET /api/work/[id]/tcpa-compliance` | Check call frequency in 7-day window |
| Log call outcome | `POST /api/work/[id]/call` | Push outcome, duration, agent to CRM |
| Update status | `PATCH /api/work/[id]/status` | Update account status on disposition |
| Log compliance event | `POST /api/voice/tools/log-compliance` | Audit trail for compliance checks |
| Search accounts | `GET /api/work/search` | Manual dial account search |
| Create call session | `POST /api/call-sessions` | Start guided call workflow in CRM |

**VoxEngine calls CRM directly:**

| When | Endpoint | Purpose |
|------|----------|---------|
| Call connects | `POST /api/voice/tools/prefetch-account` | Cache account data by phone |
| Call ends | `POST /api/voice/tools/end-call` | Log final disposition |

### CRM Changes Required

Two additions to the existing CRM:
1. **API key auth middleware** — validate `X-Dialer-Key` header on voice/work endpoints
2. **DNC lookup endpoint** — `GET /api/voice/dnc?phone=` to check `voice_dnc_entries` by phone

---

## 2. Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Backend | **Fastify** + TypeScript | 2-3x faster than Express; native JSON schema validation replaces Zod middleware; better for webhook-heavy workload (100k+ events/day) |
| Database | PostgreSQL via **Prisma** | Same engine as CRM (Supabase); thin dialer schema |
| Job Queue | **BullMQ + Redis** | Campaign dial jobs with retry/backoff; rate limiting for TCPA; contact claiming without race conditions; distributed locking |
| Frontend | **Next.js 14** (App Router) + **Tailwind** | Same as CRM; agents see both apps; SSR for dashboards |
| Real-time | **Socket.IO** (Redis adapter) | Live call state, campaign progress, agent status; works across multiple backend instances |
| Softphone | **Voximplant WebSDK** | Native WebRTC; ACD status management; only option for connecting to Voximplant calls |
| Auth | CRM passthrough (Supabase verify) → local JWT | Single identity provider; no duplicate user management |
| Call Logic | **VoxEngine** scenarios (JavaScript) | Voximplant cloud-executed; handles AMD, recording, media bridging, IVR |
| Deployment | **Docker Compose** (app + postgres + redis) | Standard containerized deployment |

---

## 3. Project Structure

```
elite-dialer/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── config.ts
│   │   ├── index.ts                    # Fastify + Socket.IO server
│   │   ├── lib/
│   │   │   ├── prisma.ts
│   │   │   ├── logger.ts
│   │   │   └── crm-client.ts           # HTTP client for all CRM API calls
│   │   ├── middleware/
│   │   │   └── auth.ts                 # JWT verify + CRM user lookup
│   │   ├── routes/
│   │   │   ├── auth.ts                 # Login via CRM credentials
│   │   │   ├── campaigns.ts            # CRUD + start/stop/pause
│   │   │   ├── calls.ts                # Manual dial, disposition, active calls
│   │   │   ├── agents.ts               # Agent status, Voximplant user mapping
│   │   │   ├── phone-numbers.ts        # DID management, groups, health
│   │   │   ├── reports.ts              # Dashboards, agent performance, campaign stats
│   │   │   └── webhooks.ts             # Voximplant call events
│   │   ├── services/
│   │   │   ├── voximplant-api.ts        # Management API wrapper
│   │   │   ├── campaign-engine.ts       # Campaign lifecycle orchestration
│   │   │   ├── compliance-gate.ts       # Pre-dial compliance checks
│   │   │   └── did-manager.ts           # Caller ID selection, health scoring
│   │   └── jobs/
│   │       ├── sync-call-outcome.ts     # Push call results to CRM
│   │       ├── sync-campaign-progress.ts # Update campaign stats
│   │       ├── batch-compliance-check.ts # Bulk pre-dial compliance
│   │       ├── compliance-refresh.ts    # Re-check during active campaigns
│   │       └── did-health-check.ts      # Hourly number health scoring
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx                 # Login
│   │   │   └── dashboard/
│   │   │       ├── layout.tsx           # Sidebar + persistent softphone bar
│   │   │       ├── page.tsx             # Agent home: queue + active call
│   │   │       ├── campaigns/page.tsx   # Campaign list + create/edit
│   │   │       ├── supervisor/page.tsx  # Live monitoring
│   │   │       ├── phone-numbers/page.tsx
│   │   │       ├── reports/page.tsx
│   │   │       └── settings/page.tsx
│   │   ├── components/
│   │   │   ├── softphone/               # WebSDK wrapper, call controls
│   │   │   ├── campaign/                # Campaign forms, progress
│   │   │   └── supervisor/              # Live call cards, monitoring
│   │   ├── hooks/
│   │   │   ├── useVoximplant.ts         # WebSDK connection, call state
│   │   │   ├── useSocket.ts            # Socket.IO real-time events
│   │   │   └── useCRM.ts               # CRM API calls
│   │   └── lib/
│   │       ├── api.ts                   # Dialer backend API client
│   │       ├── crm.ts                   # Direct CRM calls for screen pop
│   │       └── socket.ts               # Socket.IO client singleton
│   └── tailwind.config.js
├── voxfiles/
│   ├── scenarios/
│   │   ├── outbound-agent.voxengine.js  # Manual/preview: AMD → agent → record
│   │   ├── outbound-pds.voxengine.js    # PDS: call list → AMD → SmartQueue → agent
│   │   └── inbound-ivr.voxengine.js     # IVR → SmartQueue → agent
│   └── modules/
│       ├── config.voxengine.js          # Shared constants
│       └── crm-webhook.voxengine.js     # HTTP helpers for CRM + dialer backend
├── docker-compose.yml
├── .env.example
└── package.json
```

---

## 4. Database Schema

### campaigns

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | String | |
| crm_campaign_id | String? | FK to CRM voice_campaigns.id |
| status | Enum | draft, scheduled, active, paused, completed |
| dial_mode | Enum | manual, preview, progressive, predictive |
| auto_answer | Boolean | Default based on dial_mode: true for progressive/predictive, false for manual/preview/inbound |
| voximplant_queue_id | Int? | SmartQueue ID |
| voximplant_list_id | Int? | Call List ID |
| schedule_start | DateTime? | |
| schedule_end | DateTime? | |
| dialing_hours_start | String | Default "08:00" |
| dialing_hours_end | String | Default "21:00" |
| timezone | String | Default "America/Chicago" |
| max_concurrent_calls | Int | Default 10 |
| max_abandon_rate | Float | Default 0.03 |
| dial_ratio | Float | Default 1.2 |
| max_attempts | Int | Default 3 |
| retry_delay_minutes | Int | Default 60 |
| did_group_id | UUID? FK | |
| caller_id_strategy | Enum | fixed, rotation, proximity |
| fixed_caller_id | String? | |
| amd_enabled | Boolean | Default true |
| voicemail_drop_url | String? | MP3 URL for VM drop |
| total_contacts | Int | Default 0 (materialized stat) |
| total_dialed | Int | Default 0 |
| total_connected | Int | Default 0 |
| total_voicemail | Int | Default 0 |
| created_by | UUID | CRM user ID |
| created_at | DateTime | |
| updated_at | DateTime | |

### agent_mappings

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| crm_user_id | String | CRM user_profiles.id |
| crm_email | String | |
| crm_role | String | rep, supervisor, admin |
| voximplant_user_id | Int | Voximplant platform user ID |
| voximplant_username | String | e.g., agent1@app.account.voximplant.com |
| status | Enum | available, on_call, wrap_up, break, offline |
| current_call_id | String? | Active Voximplant call session ID |
| current_campaign_id | UUID? FK | |
| skills | String[] | SmartQueue skill-based routing |
| created_at | DateTime | |
| updated_at | DateTime | |

### did_groups

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | String | |
| created_at | DateTime | |

### phone_numbers

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| number | String UNIQUE | E.164 format |
| voximplant_number_id | Int? | |
| did_group_id | UUID? FK | |
| area_code | String | |
| state | String? | |
| is_active | Boolean | Default true |
| health_score | Int | Default 100 (0-100) |
| daily_call_count | Int | Default 0 |
| daily_call_limit | Int | Default 100 |
| last_used_at | DateTime? | |
| cooldown_until | DateTime? | |
| created_at | DateTime | |
| updated_at | DateTime | |

### campaign_contacts

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| campaign_id | UUID FK | |
| crm_account_id | String | CRM accounts.id |
| phone | String | E.164 |
| timezone | String? | |
| status | Enum | pending, compliance_blocked, dialing, connected, completed, failed, max_attempts |
| priority | Int | Default 0 |
| attempts | Int | Default 0 |
| last_attempt_at | DateTime? | |
| last_outcome | String? | answered, no_answer, busy, voicemail, amd_machine, failed |
| next_attempt_after | DateTime | |
| compliance_cleared | Boolean | Default false |
| compliance_block_reason | String? | |
| created_at | DateTime | |
| updated_at | DateTime | |

Indexes: `[campaign_id, status, next_attempt_after]`, `[crm_account_id]`, `[phone]`

### call_events

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| voximplant_call_id | String | Voximplant session ID |
| campaign_id | UUID? FK | |
| contact_id | UUID? FK | |
| agent_mapping_id | UUID? FK | |
| crm_account_id | String? | |
| direction | Enum | inbound, outbound |
| from_number | String | |
| to_number | String | |
| status | String | initiated, ringing, answered, completed, failed |
| amd_result | String? | human, machine, timeout |
| duration_seconds | Int? | |
| recording_url | String? | |
| disposition_code | String? | |
| hangup_reason | String? | |
| voximplant_metadata | Json | Default {} |
| crm_synced | Boolean | Default false |
| created_at | DateTime | |
| updated_at | DateTime | |

Indexes: `[voximplant_call_id]`, `[campaign_id, created_at]`, `[agent_mapping_id, created_at]`, `[crm_synced]`

### agent_status_log

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| agent_mapping_id | UUID FK | |
| status | String | available, on_call, wrap_up, break, offline |
| started_at | DateTime | |
| ended_at | DateTime? | |
| duration_seconds | Int? | |
| campaign_id | UUID? FK | |
| created_at | DateTime | |

Indexes: `[agent_mapping_id, started_at]`, `[campaign_id, started_at]`

---

## 5. Call Flows

### Manual / Preview Dial

1. Agent clicks "Dial" in dialer UI
2. Dialer backend runs compliance-gate (DNC, TCPA, Reg F, account status)
3. If blocked → agent sees reason, no call placed
4. DID manager selects caller ID (fixed, rotation, or proximity)
5. Voximplant Management API starts call session → triggers `outbound-agent.voxengine.js`
6. VoxEngine: call PSTN → AMD check → if machine: VM drop + hangup; if human: continue
7. Start recording → prefetch account from CRM → connect agent via `callUser()`
8. Bridge media between PSTN and agent
9. On hangup → webhook to dialer backend → update call_events → BullMQ sync to CRM
10. Agent does disposition in CRM guided call workflow (separate tab)

**Preview vs Manual:** Preview shows account detail before dial. Manual lets agent type any number. Same flow after click.

### Progressive / Predictive (SmartQueue PDS)

1. Supervisor starts campaign in dialer UI
2. Campaign engine pulls contacts from CRM, runs batch compliance check
3. Builds CSV, uploads via Voximplant Call Lists API
4. Creates/configures SmartQueue with skills + agents
5. Starts PDS campaign (progressive or predictive mode)
6. PDS engine auto-dials contacts → triggers `outbound-pds.voxengine.js` per contact
7. VoxEngine: AMD check → machine: VM drop + report FAIL to PDS; human: continue
8. Start recording → prefetch account → report DIAL_COMPLETE to PDS
9. SmartQueue routes connected call to available agent
10. Agent WebSDK auto-answers (auto_answer = true for PDS modes)
11. Bridge media → on hangup → webhook → sync
12. PDS automatically moves to next contact

### Inbound (IVR)

1. Consumer calls DID → Voximplant routes to `inbound-ivr.voxengine.js`
2. Answer → prefetch account by caller ID
3. IVR greeting + DTMF menu:
   - Press 1 → enqueue to SmartQueue → route to agent → bridge
   - Press 2 → play balance info → offer transfer to agent
   - Press 3 → callback request → notify backend → hangup
   - No input → reprompt once → hangup
4. Agent manually accepts inbound call (auto_answer = false)
5. Recording starts → on hangup → webhook → sync

### Supervisor Monitoring

1. Supervisor sees live calls via Socket.IO feed on supervisor dashboard
2. Clicks Listen/Whisper/Barge on a call
3. Dialer backend → SmartQueue supervision API
4. Supervisor WebSDK connects to call session in selected mode
5. Can switch modes mid-call; disconnecting ends supervision only

---

## 6. VoxEngine Scenarios

### Shared Modules

**`config.voxengine.js`** — constants:
- `BACKEND_WEBHOOK_URL`, `CRM_BASE_URL`, `CRM_API_KEY`
- `RECORDING_S3_BUCKET`, `RECORDING_FORMAT` ("mp3")
- `AMD_ENABLED_DEFAULT` (true), `VM_DROP_TIMEOUT_MS` (30000)
- `AGENT_CONNECT_TIMEOUT` (30 seconds)

**`crm-webhook.voxengine.js`** — HTTP helpers:
- `notifyDialerBackend(event, data)` — POST to dialer webhook
- `prefetchAccount(phone)` — POST to CRM prefetch-account tool

Both use `Net.httpRequestAsync()` with error handling. Webhook failures log but never break the call.

### Scenario: `outbound-agent.voxengine.js`

Used by manual and preview dials. Entry via Management API with JSON customData containing: to, from, crm_account_id, campaign_id, agent_username, amd_enabled, vm_drop_url.

Flow: parse data → notify backend (call_started) → callPSTN → on connect: AMD check (machine → VM drop → hangup; human → continue) → start recording → prefetch account → callUser(agent) with 30s timeout → bridge media → on hangup: stop recording, notify backend (call_ended), terminate.

### Scenario: `outbound-pds.voxengine.js`

Used by progressive and predictive campaigns. Entry via SmartQueue PDS with call list row data (semicolon-delimited).

Flow: parse call list data → notify backend → PSTN call placed by PDS → on connect: AMD check → start recording → prefetch account → report DIAL_COMPLETE to PDS → SmartQueue assigns agent → bridge media → on hangup: notify backend, terminate. On failure: report FAIL to PDS → next contact.

Key difference: PDS manages dialing and agent assignment. This scenario doesn't call `callUser()` directly.

### Scenario: `inbound-ivr.voxengine.js`

Used by inbound calls. Entry via application rule matching DID.

Flow: answer → notify backend → prefetch account by caller ID → TTS greeting → IVR DTMF menu (1: agent, 2: payment info, 3: callback) → for agent routing: start recording → enqueue to SmartQueue → hold music → agent answers → bridge → on hangup: notify backend, terminate.

### Voicemail Drop Logic

Inlined in outbound scenarios as helper function (not a separate scenario):
- AMD detects machine → if vm_drop_url: create URL player → play MP3 → on finish: hangup → notify backend (voicemail_dropped: true)
- Safety timeout (VM_DROP_TIMEOUT_MS) forces hangup if playback stalls
- No vm_drop_url → immediate hangup → notify (voicemail_dropped: false)

---

## 7. CRM Integration Layer

### Authentication

Service-level API key (not per-user tokens):
- CRM env var: `DIALER_API_KEY`
- Dialer sends `X-Dialer-Key` header on every request
- User context passed via `crm_user_id` in request body

### crm-client.ts

Single module for all CRM API calls. If CRM API changes, fix in one place.

### BullMQ Sync Jobs

**`sync-call-outcome`** — fires on every call end
- Reads call_events record → POSTs to CRM `/api/work/[id]/call`
- Success: sets crm_synced = true
- Failure: retries 3x with exponential backoff (5s, 30s, 120s)
- Dead letter: flagged for manual review after 3 failures

**`sync-campaign-progress`** — fires every 30s per active campaign
- Aggregates local stats → updates campaign_contacts from Voximplant Call List details
- Emits progress via Socket.IO

**`batch-compliance-check`** — fires when campaign starts
- Processes contacts in batches of 100
- Runs all 4 compliance checks per contact
- Marks compliance_cleared or compliance_blocked with reason

**`compliance-refresh`** — fires every 5 minutes per active campaign
- Re-checks contacts whose compliance_cleared timestamp > 5 minutes old and haven't been dialed
- Removes newly blocked contacts from active call list

**`did-health-check`** — fires hourly
- Calculates answer rate per number over last 24 hours
- Adjusts health_score (decay on low answer rate, slow recovery)
- Auto-deactivates numbers with health_score < 20

### Error Handling

- Pre-dial compliance fails → call NOT placed (never dial without cleared check)
- Post-call sync fails → call_events persists locally (crm_synced = false), BullMQ retries
- VoxEngine prefetch fails → agent gets call without screen pop, can search CRM manually

---

## 8. Compliance Engine

Four checks run in `compliance-gate.ts` before every dial.

### Check 1: DNC

Source: CRM voice_dnc_entries via `GET /api/voice/dnc?phone=`
Cache: Redis, 15-minute TTL, key `dnc:{e164_phone}`
Rule: Phone exists in DNC → BLOCK

### Check 2: TCPA Time Window

Source: contact timezone from campaign_contacts (derived from state/zip, fallback: campaign timezone)
Rule: Current time in contact timezone outside configured dialing hours → BLOCK
Default window: 08:00-21:00 (configurable per campaign)
No CRM call needed — runs locally.

### Check 3: Reg F Frequency Cap

Source: CRM call history via `/api/work/[id]/tcpa-compliance`
Rule: 7+ calls to this account in rolling 7 calendar days → BLOCK

### Check 4: Account Status Guards

Source: CRM account status via `GET /api/work/[id]`
Block statuses: cease_and_desist, bankruptcy, deceased, legal_threat, fraud_claim, litigation_scrub, litigious_scrub, recalled_to_client, sold, paid_in_full, settled_in_full

### Per-Call Flow (Manual/Preview)

All 4 checks run in parallel. ANY failure → block with reason shown to agent. ALL pass → proceed to dial.

### Batch Flow (Campaign Start)

BullMQ job processes contacts in batches of 100. Pass → compliance_cleared = true. Fail → status = compliance_blocked + reason. TCPA-deferred contacts (outside time window but otherwise valid) get next_attempt_after set to next window opening, status stays pending.

### Audit Trail

Block events synced to CRM via `POST /api/voice/tools/log-compliance`. Pass events logged implicitly when call is placed.

---

## 9. Real-Time Architecture

Socket.IO backed by Redis adapter for multi-instance support.

### Agent Events (room: `agent:{crm_user_id}`)

| Event | When |
|-------|------|
| `call:incoming` | PDS/inbound routes call to agent. Payload: call ID, from number, account summary, campaign |
| `call:connected` | Agent answers or outbound connects. Payload: call ID, duration start |
| `call:ended` | Either party hangs up. Payload: call ID, duration, outcome |
| `preview:next` | Preview mode pushes next contact. Payload: contact + account summary |
| `status:changed` | Server changes agent status. Payload: new status |

### Supervisor Events (room: `supervisors`)

| Event | When |
|-------|------|
| `call:live_update` | Every 5s per active call. Payload: call ID, agent name, masked phone, duration, status |
| `campaign:progress` | Every 10s per active campaign. Payload: stats |
| `agent:status_change` | Agent status transition. Payload: user ID, name, old/new status |
| `alert:abandon_rate` | Rate exceeds threshold. Payload: campaign ID, current rate, threshold |
| `alert:compliance_block` | Real-time block during campaign. Payload: campaign, contact, reason |

### System Events (room: `system`, admin only)

| Event | When |
|-------|------|
| `voximplant:health` | Every 60s. Voximplant API health check |
| `crm:health` | Every 60s. CRM API health check |
| `sync:failed` | BullMQ sync job exhausted retries |

### WebSDK vs Socket.IO

Two separate real-time channels:
- **Voximplant WebSDK** — audio/media events (ring, connect, hangup, DTMF). WebRTC layer.
- **Socket.IO** — application events (screen pop, campaign progress, agent status). Business logic layer.

Both fire on the same call events but carry different data. WebSDK handles audio, Socket.IO handles context.

---

## 10. Frontend Architecture

### Layout

Persistent softphone bar at bottom of screen (stays mounted across navigation). Standard sidebar navigation for pages.

```
┌──────────────────────────────────────────────────────┐
│  Sidebar          │  Page Content                     │
│  ● Dashboard      │  (varies by page)                 │
│  ● Campaigns      │                                   │
│  ● Phone Numbers  │                                   │
│  ● Reports        │                                   │
│  ● Settings       │                                   │
│  ── Supervisor ── │                                   │
│  ● Live Monitor   │                                   │
├───────────────────┴───────────────────────────────────┤
│  Softphone Bar (persistent)                           │
│  [Status ▼] [Timer] [Mute] [Hold] [End]              │
│  Caller: (312) 555-1234 — John Doe — $2,450.00       │
│  [Open in CRM ↗]                                     │
└──────────────────────────────────────────────────────┘
```

### Pages

**Agent Dashboard** (`/dashboard`)
- Idle: daily stats, upcoming callbacks
- Preview: account summary from CRM, "Dial" button
- On-call: timer, call controls, "Open in CRM" button (opens `{CRM_URL}/work/{accountId}`)
- Wrap-up: disposition selector, notes, callback scheduler

**Campaigns** (`/dashboard/campaigns`)
- List: status badge, dial mode, progress bar, date range
- Create/edit: name, mode, CRM worklist, DID group, schedule, pacing, AMD, VM drop
- Detail: contact list, real-time progress, start/pause/stop controls
- Supervisor+ for CRUD; agents see assigned campaigns read-only

**Phone Numbers** (`/dashboard/phone-numbers`)
- DID inventory: number, area code, health score, usage, cooldown
- DID groups: create, assign numbers, link to campaigns
- Health dashboard: sorted by score, flagged numbers highlighted
- Admin only

**Reports** (`/dashboard/reports`)
- Campaign: connect rate, AMD rate, avg duration, outcomes, abandon rate
- Agent: calls handled, talk time, avg handle time, dispositions
- DID health: calls per number, answer rates by area code
- Date range filters, CSV export
- All data from local call_events + agent_status_log (no CRM dependency)

**Supervisor Live Monitor** (`/dashboard/supervisor`)
- Live call list via Socket.IO (agent name, masked phone, duration, status)
- Listen/Whisper/Barge buttons per call
- Campaign overview: agents online, calls in progress, queue depth, abandon rate
- Supervisor+ only

**Settings** (`/dashboard/settings`)
- Global TCPA window, AMD defaults, retry defaults
- Voximplant connection status
- CRM connection status
- Admin only

### Role-Based Visibility

| Page | Agent | Supervisor | Admin |
|------|-------|-----------|-------|
| Dashboard | Own stats + call UI | Own stats + call UI | Own stats + call UI |
| Campaigns | Read-only (assigned) | Full CRUD + controls | Full CRUD + controls |
| Phone Numbers | Hidden | Read-only | Full CRUD |
| Reports | Own stats | All agents + campaigns | Everything |
| Supervisor Monitor | Hidden | Full access | Full access |
| Settings | Hidden | Hidden | Full access |

### Auto-Answer by Dial Mode

| Dial Mode | Behavior | Rationale |
|-----------|----------|-----------|
| Manual | Manual accept | Agent initiated, already ready |
| Preview | Manual accept | Agent reviewing account, accepts when ready |
| Progressive | Auto-answer | System dialed when agent free, no wait |
| Predictive | Auto-answer | Speed is the point |
| Inbound | Manual accept | Agent needs screen pop moment |

Configurable per campaign via `auto_answer` boolean, defaulting based on dial mode.

### useVoximplant Hook

Wraps WebSDK lifecycle:
- SDK init → connect → loginWithToken
- ACD status management (InService, AfterService, Offline)
- Outbound calls (client.call for manual/preview)
- Incoming calls (IncomingCall event for PDS/inbound)
- Call controls (answer, hangup, mute, hold, sendDigits)
- Audio device selection

Agent login flow:
1. Agent enters CRM email + password
2. Dialer backend verifies against CRM Supabase auth
3. Looks up agent_mappings for Voximplant credentials
4. Returns JWT + Voximplant login token
5. Frontend: useVoximplant calls client.loginWithToken()
6. Agent set to InService ACD status — ready for calls

### CRM Screen Pop

On call connect, softphone bar shows condensed summary (name, balance, phone) and "Open in CRM" button → `{CRM_BASE_URL}/work/{crm_account_id}` in new tab.

---

## 11. Reporting & Monitoring

### Campaign Performance

Metrics: total dialed, connect rate, AMD rate, voicemail drops, avg duration, abandon rate (from SmartQueue), outcomes breakdown, contacts remaining, compliance blocks.

### Agent Performance

Metrics: calls handled, talk time, avg handle time (from agent_status_log transitions), idle time, connect rate, dispositions, calls per hour.

### DID Health

Metrics: calls per number, answer rate per number, answer rate per area code, flagged numbers, daily usage vs limit, cooldown status.

### Health Score Decay

Hourly BullMQ job:
- Answer rate < 15% over 24h → health_score -= 10
- Answer rate 15-30% → health_score -= 5
- Answer rate > 30% → health_score += 2
- Clamped to [0, 100]
- Score < 20 → auto-deactivate + 24h cooldown
- Score < 50 → alert to admin

Daily call count resets at midnight (campaign timezone).

Future improvement: integrate Number Sentinel for real STIR/SHAKEN attestation data.

### Data Sources

- Real-time (supervisor dashboard): Redis in-memory state + Socket.IO. No database queries.
- Historical (reports): PostgreSQL queries on call_events, agent_status_log, campaign_contacts.

All reports support date range filters and CSV export.

---

## 12. Deferred Features (Future Phases)

- **AI Voice Agent** — 5th VoxEngine scenario using Voximplant's native OpenAI Realtime connector. Plugs into same call flow, replaces human agent bridge with AI conversation.
- **Transcription** — enable `transcribe: true` on Recorder module. Recording pipeline designed to support this.
- **Number Sentinel Integration** — replace heuristic health scoring with real carrier reputation data.
- **Advanced IVR** — multi-level menus, speech recognition, callback scheduling with time slot selection.
- **CRM Embedding** — optionally embed dialer softphone directly in CRM as a widget (eliminates side-by-side requirement).

---

## 13. Environment Variables

```
# Server
NODE_ENV=production
PORT=5000

# Database
DATABASE_URL=postgresql://...

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=<min 32 chars>
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
CRM_API_KEY=<shared secret>

# Recording
RECORDING_S3_BUCKET=
RECORDING_S3_REGION=
RECORDING_S3_ACCESS_KEY=
RECORDING_S3_SECRET_KEY=

# Frontend
FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_DIALER_API_URL=http://localhost:5000
NEXT_PUBLIC_CRM_URL=https://your-crm.vercel.app
```
