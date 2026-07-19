# Quinn — AI Chief Marketing Officer for Dermaqea

Quinn is an autonomous AI marketing executive built as a multi-agent system. Quinn proactively researches, plans, drafts, analyzes, and recommends actions to grow Dermaqea, requiring human approval before any external execution.

Quinn is **not** a chatbot. Quinn is a long-term AI employee that serves as Dermaqea's Chief Marketing Officer, working 24/7 with a team of 6 specialist agents.

---

## Architecture

```
                    ┌───────────────────────────────────────────────┐
                    │              Human CEO / User                  │
                    │     Telegram · Dashboard · REST API · CLI      │
                    └───────────────────┬───────────────────────────┘
                                        │
                    ┌───────────────────▼───────────────────────────┐
                    │            API Server (Express.js)             │
                    │        REST · WebSocket · Telegram Bot         │
                    │  Caching: Redis (cacheGet/cacheSet per TTL)   │
                    └───────────────────┬───────────────────────────┘
                                        │
                    ┌───────────────────▼───────────────────────────┐
                    │          Quinn LangGraph (StateGraph)          │
                    │          Supervisor-Worker Pattern             │
                    │  ┌─────────────────────────────────────────┐   │
                    │  │  normalize_input → quinn (supervisor)   │   │
                    │  │         ↕ conditional routing            │   │
                    │  │  sage → nova → atlas → iris → helix     │   │
                    │  │         → beacon → synthesize            │   │
                    │  │  All agents return to quinn;             │   │
                    │  │  quinn decides next or routes to         │   │
                    │  │  synthesize → __end__                    │   │
                    │  └─────────────────────────────────────────┘   │
                    └───────────────────┬───────────────────────────┘
                                        │
         ┌──────────────────────────────┼──────────────────────────────┐
         │                              │                              │
         ▼                              ▼                              ▼
┌────────────────────┐    ┌────────────────────────┐    ┌────────────────────────┐
│   PostgreSQL       │    │   Redis (BullMQ)       │    │   Redis Cloud          │
│   + pgvector       │    │   Job Scheduling       │    │   Agent Memory (Iris)  │
│   (Prisma ORM)     │    │                        │    │                        │
│                    │    │   8 cron workflows      │    │   Session events       │
│   Briefings        │    │   daily/weekly/quarterly│    │   Long-term memory     │
│   Approvals        │    │                        │    │   Semantic search      │
│   Orgs/CRM/Content │    │   BullMQ Queue          │    │                        │
│   Analytics/Goals  │    │   Worker: concurrency 1 │    │   Optional fallback:   │
│   Memory (fallback)│    │                        │    │   pgvector             │
└────────────────────┘    └────────────────────────┘    └────────────────────────┘
```

## Agent Team

| Agent | Role | Model | Tools |
|-------|------|-------|-------|
| **Quinn** | CMO supervisor — delegates, strategizes, responds conversationally | `llama-3.3-70b-versatile` | Memory search, agent coordination |
| **Sage** | Research intelligence — companies, competitors, industry trends | `llama-3.3-70b-versatile` | Web search, content extraction, CRM write |
| **Nova** | Content marketing — LinkedIn, blog, newsletters, calendar | `llama-3.3-70b-versatile` | Web search, content CRUD, approvals |
| **Atlas** | Growth & BD — partnerships, grants, accelerators, prospects | `llama-3.3-70b-versatile` | Web search, opportunity scoring, approvals |
| **Iris** | Relationship management — CRM, follow-ups, outreach | `llama-3.3-70b-versatile` | Follow-up tracking, CRM read, approvals |
| **Helix** | Presentations & assets — decks, proposals, materials | `llama-3.3-70b-versatile` | Asset generation, approvals |
| **Beacon** | Analytics — KPIs, performance tracking, OKR progress | `llama-3.3-70b-versatile` | Analytics queries, goal tracking |
| **Synthesize** | Final briefing — compiles reports into executive summary | `llama-3.3-70b-versatile` | Database writes, briefing generation |

## Data Flow

```
User sends message ──► Telegram Bot / REST API / Dashboard
                           │
                    chatWithQuinn(graph, text, threadId)
                           │
                    ┌──────▼──────────────────────────────┐
                    │  Quinn Graph (LangGraph)             │
                    │                                     │
                    │  1. normalize_input (message prep)   │
                    │  2. quinn (supervisor)               │
                    │     ├─ Retrieves context from         │
                    │     │  Redis Agent Memory (or pgvector)│
                    │     ├─ Decides: route to agent or     │
                    │     │  respond directly (__end__)     │
                    │     └─ Delegates to specialist        │
                    │                                     │
                    │  [quinn ↔ sage/nova/atlas/iris/      │
                    │         helix/beacon (iterates)]     │
                    │                                     │
                    │  3. synthesize → final response      │
                    │     └─ Saves briefing to PostgreSQL   │
                    └──────┬──────────────────────────────┘
                           │
                    Response returned to user
                           │
                    Session event stored in
                    Redis Agent Memory (conversation history)
```

## Tech Stack

- **Agent Orchestration**: LangGraph.js (supervisor-worker pattern, PostgreSQL checkpointing)
- **LLMs**: Groq LLaMA 3.3 70B Versatile
- **Database**: PostgreSQL + pgvector (semantic memory fallback, Prisma ORM)
- **Memory**: Redis Cloud Agent Memory (session events + long-term semantic search)
- **Caching**: Redis (in-memory cache with TTL for API endpoints)
- **Job Scheduling**: BullMQ + Redis (8 cron workflows)
- **API**: Express.js + WebSocket (real-time dashboard updates)
- **Bot**: Telegraf.js (Telegram, conversational interface)
- **Dashboard**: Next.js 16 + Tailwind CSS + shadcn/ui
- **Observability**: LangSmith tracing
- **Monorepo**: Turborepo + pnpm workspaces

## Project Structure

```
quinn/
├── apps/
│   ├── api/                    # Express REST + WebSocket server
│   │   └── src/index.ts        # API routes, scheduler init, cache layer
│   └── web/                    # Next.js executive dashboard
│       └── src/                # Dashboard pages, components
├── packages/
│   ├── agents/                 # LangGraph agent system
│   │   └── src/
│   │       ├── agents/         # quinn.ts, sage.ts, nova.ts, atlas.ts,
│   │       │                   # iris.ts, helix.ts, beacon.ts, synthesize.ts
│   │       ├── telegram/       # bot.ts (Telegram conversational interface)
│   │       ├── memory/         # semantic.ts (pgvector), redis-memory.ts (Iris SDK)
│   │       ├── prompts/        # system.ts (prompt builder)
│   │       ├── tools/          # LangChain tools for each agent
│   │       ├── workflows/      # index.ts (chatWithQuinn, runDailyBriefing, etc.)
│   │       └── graph.ts        # StateGraph wiring, checkpointing
│   ├── database/               # Prisma schema + migrations + seed
│   ├── scheduler/              # BullMQ cron jobs (8 scheduled workflows)
│   └── shared/                 # Types, constants, Redis client, cache utility
├── docker-compose.yml          # PostgreSQL + Redis for local dev
├── turbo.json
└── pnpm-workspace.yaml
```

## Scheduled Workflows

| Schedule | Workflow | Description |
|----------|----------|-------------|
| Daily 6:00 AM | Research Sweep | Sage searches for industry developments, competitor news, emerging opportunities |
| Daily 7:00 AM | Analytics Snapshot | Beacon reviews KPIs, OKR progress, flags anomalies |
| Daily 7:30 AM | Content Generation | Nova reviews calendar, drafts LinkedIn posts and upcoming content |
| Daily 8:00 AM | Daily Briefing | Full briefing: all agents consulted, synthesized for CEO |
| Hourly 9AM-6PM | Follow-up Check | Iris checks for overdue follow-ups, expiring opportunities |
| Monday 9:00 AM | Weekly Priorities | Top 5 priorities with owners, deadlines, OKR alignment |
| Friday 5:00 PM | Weekly Report | Achievements, KPIs, wins, risks, next week's focus |
| Quarterly 9 AM | Quarterly Planning | OKRs, initiatives, milestones, success criteria |

## Redis Architecture

Redis serves three distinct roles, sharing a singleton connection via `@quinn/shared/src/redis.ts`:

1. **BullMQ Queue** — Job scheduling for all cron workflows. Connection shared across scheduler and worker.
2. **API Cache** — GET endpoint responses cached with TTL (30s-120s). Cache invalidated on writes. Key prefix: `quinn:cache:*`.
3. **Agent Memory (Iris)** — Long-term semantic memory via Redis Cloud's Agent Memory service. Stores conversation session events and searchable long-term memory records. Optional — falls back to PostgreSQL pgvector if not configured.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (with pgvector) |
| `REDIS_URL` | Yes | Redis connection string (BullMQ + caching) |
| `GROQ_API_KEY` | Yes | Groq API key (LLM inference) |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot token (disables bot if not set) |
| `TELEGRAM_ALLOWED_USERS` | No | Comma-separated Telegram user IDs/usernames |
| `AGENT_MEMORY_BASE_URL` | No | Redis Cloud Agent Memory API endpoint |
| `AGENT_MEMORY_STORE_ID` | No | Redis Cloud Agent Memory store ID |
| `AGENT_MEMORY_API_KEY` | No | Redis Cloud Agent Memory API key |
| `TAVILY_API_KEY` | Yes | Tavily web search API |
| `LANGSMITH_API_KEY` | No | LangSmith observability |

## Interaction Interfaces

### Telegram Bot
Natural conversation — no slash commands. Just talk to Quinn like a team member. Supports inline approval buttons (Approve/Reject/View) when Quinn requests sign-off.

### REST API
`POST /api/quinn/chat` — Send a message to Quinn with optional `threadId` for conversation continuity.

### Dashboard
Next.js web dashboard at `apps/web/` — Command Center, Approvals, Research, Content Hub, Growth Pipeline, CRM, Analytics, OKRs.

## Getting Started

### Prerequisites
- Node.js >= 20, pnpm >= 9, Docker

### Setup
```bash
pnpm install
cp .env.example .env
# Edit .env with your API keys
docker compose up -d               # PostgreSQL + Redis
pnpm db:generate
pnpm db:push
pnpm db:seed                       # Seed sample data
pnpm dev                           # Starts API + Dashboard
```

### API Server
```
http://localhost:4000              # REST API
ws://localhost:4000/ws              # WebSocket
```

### Dashboard
```
http://localhost:3000              # Next.js dashboard
```

## Human Approval Workflow

All external actions require approval. The flow is:

1. Agent identifies opportunity/action
2. Creates `Approval` record in database
3. Quinn includes it in briefing or sends alert
4. CEO reviews via Telegram (inline buttons) or Dashboard
5. On approval: action is executed (outreach email, content publish, etc.)
6. Result is tracked and reported

## License
Private — Dermaqea
