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

The API does not implement discovery, scoring, AI, outreach, automation, authentication, or CRM expansion.

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
VITE_API_BASE_URL=http://localhost:4000/api
NODE_ENV=development
```

The frontend uses `VITE_API_BASE_URL`. The Supabase URL and service-role key are loaded server-side and must remain private.

## Database

The Supabase migration is located at `supabase/migrations/001_create_businesses_and_leads.sql`.

It creates:

- `businesses`
- `leads` with `leads.business_id -> businesses.id`
- indexes for business name, lead status, and business relationship

The existing migration is the source of truth. Do not rewrite completed migration history; create another migration for schema changes.

The current migration already declares `opportunity_score` with a default of `0`. Because the migration is already applied, changing it would require a new migration. No schema change was made for this Step 2 requirement.

## API

### Leads

```text
GET    /api/leads
GET    /api/leads/:id
POST   /api/leads
PATCH  /api/leads/:id
```

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
