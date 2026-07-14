# Quinn — AI Chief Marketing Officer for Dermaqea

Quinn is an autonomous AI marketing executive built as a multi-agent system. Quinn proactively researches, plans, drafts, analyzes, and recommends actions to grow [Dermaqea](https://dermaqea.com), requiring human approval before any external execution.

Quinn is **not** a chatbot. Quinn is a long-term AI employee that serves as Dermaqea's Chief Marketing Officer, working 24/7 with a team of 6 specialist agents.

## Architecture

```
                    Human CEO
                       │
                 (Final Approval)
                       │
                 Quinn (CMO)
        AI Chief Marketing Officer
                       │
 ┌──────────┬──────────┬──────────┬──────────┐
 │          │          │          │          │
Sage      Nova      Atlas      Iris     Helix    Beacon
Research  Content   Growth &   CRM &    Assets   Analytics
Agent     Marketing  BD        Relations
```

| Agent | Role | Model |
|-------|------|-------|
| **Quinn** | CMO supervisor — coordinates all agents, sets strategy | GPT-4o |
| **Sage** | Research intelligence — companies, competitors, industry | GPT-4o-mini |
| **Nova** | Content marketing — LinkedIn, blog, newsletters | GPT-4o-mini |
| **Atlas** | Growth & BD — partnerships, grants, accelerators | GPT-4o-mini |
| **Iris** | Relationship management — CRM, follow-ups | GPT-4o-mini |
| **Helix** | Presentations & assets — pitch decks, proposals | GPT-4o-mini |
| **Beacon** | Analytics — KPIs, performance tracking | GPT-4o-mini |

## Tech Stack

- **Agent Orchestration**: LangGraph.js (supervisor-worker pattern)
- **LLMs**: OpenAI GPT-4o / GPT-4o-mini
- **Database**: PostgreSQL + pgvector (semantic memory)
- **ORM**: Prisma
- **Job Scheduling**: BullMQ + Redis
- **API**: Express.js + WebSocket
- **Dashboard**: Next.js 16 + Tailwind CSS + shadcn/ui
- **Observability**: LangSmith
- **Monorepo**: Turborepo + pnpm workspaces

## Project Structure

```
quinn/
├── apps/
│   ├── api/              # Express REST + WebSocket server
│   └── web/              # Next.js executive dashboard
├── packages/
│   ├── agents/           # LangGraph agent system (Quinn + 6 workers)
│   ├── database/         # Prisma schema + pgvector memory
│   ├── scheduler/        # BullMQ cron jobs (daily/weekly/quarterly)
│   └── shared/           # Types, constants, decision framework
├── docker-compose.yml    # PostgreSQL + Redis for local dev
├── turbo.json
└── pnpm-workspace.yaml
```

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker (for PostgreSQL + Redis)

### 1. Clone & Install

```bash
git clone <repo-url> quinn
cd quinn
pnpm install
```

### 2. Environment Setup

```bash
cp .env.example .env
# Edit .env with your API keys
```

### 3. Start Infrastructure

```bash
docker compose up -d
```

### 4. Initialize Database

```bash
pnpm db:generate
pnpm db:push
pnpm db:seed
```

### 5. Run Development

```bash
# Start the API server (includes scheduler)
cd apps/api && pnpm dev

# In another terminal — start the dashboard
cd apps/web && pnpm dev
```

The dashboard will be available at `http://localhost:3000`.

## Dashboard Pages

| Page | Description |
|------|-------------|
| **Command Center** | Today's briefing, KPIs, pending approvals, quick actions |
| **Approvals** | Review and approve/reject Quinn's recommendations |
| **Research** | Organizations and contacts discovered by Sage |
| **Content Hub** | Content calendar, drafts, and published items |
| **Growth Pipeline** | Partnerships, grants, accelerators, opportunities |
| **CRM** | Relationship tracking and follow-up management |
| **Analytics** | Marketing KPIs and performance metrics |
| **OKRs** | Quarterly goals and key results |
| **Talk to Quinn** | Direct conversation with Quinn for ad-hoc requests |
| **Settings** | Agent configuration and preferences |

## Human Approval Workflow

Nothing external happens automatically. Every workflow follows:

**Research → Analyze → Draft → Recommend → Await Human Approval → Execute → Track → Report**

## Scheduled Workflows

| Schedule | Workflow | Description |
|----------|----------|-------------|
| Daily 8:00 AM | Daily Briefing | Executive summary with priorities |
| Monday 9:00 AM | Weekly Priorities | Top priorities for the week |
| Friday 5:00 PM | Weekly Report | Performance review and recommendations |
| Quarterly | Quarterly Planning | OKR setting and strategic planning |

## License

Private — Dermaqea
