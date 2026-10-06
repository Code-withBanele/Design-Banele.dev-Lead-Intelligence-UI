# Banele.dev Lead Intelligence

A React frontend, Node/Express API, and Supabase PostgreSQL application for managing business leads.

## Architecture

```text
React frontend
  ? API service layer
  ? Node.js + Express
  ? Supabase JavaScript client
  ? PostgreSQL
```

The frontend communicates only with the local Node API. The Supabase service-role key is server-only and is never exposed to the browser.

## Included features

- Persistent leads loaded from the API
- Manual business creation
- Lead status filtering and pagination
- Table and Kanban views
- Lead status updates through `PATCH /api/leads/:id`
- Structured API errors and loading states
- Supabase-backed businesses and leads
- Deterministic digital audit factors with `hasGoogleBusinessProfile` included
- Centralized opportunity-scoring ruleset and computed classifications
- API endpoints for audit persistence and score retrieval
- Backend-only OpenRouter AI business analysis layered on top of authoritative score results
- Bounded digital intelligence collection with evidence states and verified robots.txt/sitemap checks
- Deterministic lead qualification based on score, audit coverage, and evidence sufficiency
- Server-calculated analytics derived from persisted lead lifecycle, contact, audit, and score data

The application does not implement automated discovery, outbound messaging, n8n execution, authentication, or CRM integrations. Notification delivery is not connected to an event store.

## Technology

- React 19
- TypeScript
- Vite 8
- Tailwind CSS 4
- React Router DOM
- Node.js + Express
- Supabase JavaScript client
- PostgreSQL

## Local development

Install the frontend dependencies:

```bash
pnpm install
```

Start the frontend:

```bash
pnpm dev
```

Install the backend dependencies from the `server` directory:

```bash
cd server
npm install
npm run dev
```

The API listens on `http://localhost:4000` and serves `/api/leads`.

## Environment variables

Create a root `.env` file with:

```env
PORT=4000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENROUTER_API_KEY=your-openrouter-key
VITE_API_BASE_URL=http://localhost:4000/api
NODE_ENV=development
```

The frontend uses `VITE_API_BASE_URL`. The Supabase URL, service-role key, and OpenRouter key are loaded server-side and must remain private.

### AI business analysis layer

Step 4 adds a backend-only AI layer that interprets deterministic lead results without altering the score. The AI service:

- requires an existing opportunity score before generating analysis
- uses OpenRouter with model fallback and capability checks
- stores AI output in the `ai_analyses` table
- exposes `GET /api/leads/:id/ai-analysis` and `POST /api/leads/:id/ai-analysis`
- keeps the deterministic score authoritative and immutable from AI output

## Database

The Supabase migration is located at `supabase/migrations/001_create_businesses_and_leads.sql`.

It creates:

- `businesses`
- `leads` with `leads.business_id -> businesses.id`
- indexes for business name, lead status, and business relationship

The existing migration is the source of truth. Do not rewrite completed migration history; create another migration for schema changes.

Apply migrations in numeric order before using the corresponding features. Migration `007_lead_qualification.sql` creates or upgrades qualification snapshots. Migration `008_digital_evidence_observation_status.sql` adds explicit `FOUND`, `NOT_FOUND`, `UNKNOWN`, and `FAILED` evidence states. Builds do not apply migrations to Supabase.

The hardened migration declares `opportunity_score` with a default of `NULL`, and `0` remains a valid calculated score when a score has been computed. The repository tracks this as a schema change in `supabase/migrations/002_harden_lead_creation.sql`, and it must be applied to the live Supabase project before the transactional lead-creation flow is considered production-ready.

## API

### Leads

```text
GET    /api/leads
GET    /api/leads/:id
POST   /api/leads
PATCH  /api/leads/:id
GET    /api/analytics
```

`GET /api/analytics` derives conversion rate from current `WON` lead stages, meetings from current `MEETING` stages, recorded outreach from non-null `first_contacted_at`, and reply rate from `REPLIED` leads divided by leads with recorded first contact. Rates/counts are `null` when the source dataset is absent; a calculated zero remains `0`. No outbound message/activity records exist, so the contact count is not a sent-message count.

Lead statuses are case-sensitive:

```text
NEW
QUALIFIED
AUDITED
CONTACTED
REPLIED
MEETING
PROPOSAL
WON
LOST
ARCHIVED
```

A create request must include a non-empty business name. Industry and location are optional. The server creates a business record and an associated lead record.

## Persistence verification

1. Start the backend.
2. Create a lead through the UI or `POST /api/leads`.
3. Confirm that the API returns the created record.
4. Refresh the browser.
5. Confirm the lead remains visible.
6. Change its status and refresh again.

## Scripts

```bash
pnpm exec tsc --noEmit
pnpm build
pnpm format
cd server && pnpm build
```

## Project layout

```text
server/                 # Express API
supabase/migrations/    # Supabase SQL migrations
src/                    # React frontend
```
