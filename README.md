# Banele.dev Lead Intelligence

An internal, AI-assisted business prospecting and digital-opportunity platform for Banele.dev.

This repository contains the **frontend UI only**. It models the complete workflow from business discovery through qualification and human-approved outreach, while keeping deterministic scoring, AI interpretation, automation, and persistence as separate backend responsibilities.

## Product workflow

```text
Business Sources
  → Lead Discovery
  → Data Enrichment
  → Digital Audit
  → Deterministic Opportunity Scoring
  → AI Business Analysis
  → Lead Qualification
  → Human-Approved Outreach
  → CRM Pipeline
  → Conversion
```

The central product principle is:

> Deterministic systems make deterministic decisions. AI interprets, analyses, and generates.

When scoring is connected, opportunity scores must show their classification, ruleset version, calculation timestamp, and contributing factors. No scores are fabricated in this frontend.

## Implemented frontend

- Dashboard with session lead counts and honest empty states for unavailable results
- Lead CRM with manual entry, search, status filters, row-based pagination, table view, and Kanban view
- Discovery, Audits, and Automation workspaces with disconnected-service states
- Analytics with matching interactive CometDial components for conversion rate, outreach sent, meetings booked, and reply rate
- Settings with unconfigured-provider states and scoring/outreach requirements
- Responsive desktop, tablet, and mobile layouts
- Reusable badges, cards, tables, and empty states
- App-wide animated background featuring the React Bits Prism WebGL component

No mock businesses, scores, audit results, activity, credentials, or performance metrics are loaded. Manually entered business records live only in React state and are cleared on refresh. Dashboard rates without data are shown as an em dash.

### Navigation and leads

- The primary sidebar is borderless, with expandable branches and centered pill-shaped navigation options.
- The header menu button shows or hides the sidebar on desktop and mobile. Hiding it frees the page width; the sidebar close button and Escape key also dismiss it. Desktop navigation keeps it open, while mobile navigation closes it after selection.
- The logo sits inside the navigation area and returns to Dashboard.
- Branch decorations do not intercept clicks, and the navigation scrolls when needed.
- Add lead accepts a business name, optional industry, and optional location. New records start with the `NEW` status; no audit or score is inferred.
- Search matches business names, industries, and locations. Status filtering works in both table and board views.
- Table pagination displays ten matching records per page and changes the actual rows. Search and status changes reset to the first page; unavailable previous/next controls are disabled.
- The board groups actual session records by status. Status progression and CRM conversion are not implemented.

### Analytics dials

| Card | Unit | Interactive range |
| --- | --- | --- |
| Conversion rate | Percent (`%`) | 0–100 |
| Outreach sent | Whole message count | 0–1,000 |
| Meetings booked | Whole meeting count | 0–100 |
| Reply rate | Percent (`%`) | 0–100 |

All four cards share the same CometDial component and red accent treatment. Each dial starts at zero and changes in whole-number steps. Visible labels show only the metric name, without “preview” wording. The ranges are UI interaction bounds, not business targets or measured limits.

Dial interaction changes only local component state. It does not record messages, book meetings, calculate conversion, or reflect backend analytics. The Analytics page retains a no-data message because no activity metrics are connected.

## Technology

- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- OGL for the Prism shader renderer
- oxfmt

## Getting started

Install dependencies:

```bash
pnpm install
```

Start the local development server:

```bash
pnpm dev
```

Build the production bundle:

```bash
pnpm build
```

Format the project:

```bash
pnpm format
```

Check TypeScript:

```bash
pnpm exec tsc --noEmit
```

When running inside Figma Make, the Vite development server is already managed by the environment and should not be started manually.

## Project structure

```text
src/
├── App.tsx                # Application entry and route composition
├── BranchedMenu.tsx       # Expandable primary navigation
├── CometDial.tsx          # Interactive dial shared by the four Analytics cards
├── Prism.jsx              # React Bits Prism component (JavaScript)
├── Prism.css              # Prism container and canvas styling
├── Prism.d.ts             # Prism prop types for TypeScript consumers
├── components/
│   └── ui.tsx             # Shared UI primitives used by the leads feature
├── features/
│   └── leads/
│       ├── components/   # Leads page, add-lead form, table, Kanban, and pagination
│       ├── hooks/         # Session-only lead state and filtering logic
│       └── index.ts       # Leads feature exports
├── services/
│   └── api/
│       ├── client.ts      # Shared base URL and request configuration
│       ├── leads.ts       # Backend service contract (not connected)
│       └── index.ts       # API service exports
├── types/
│   ├── lead.ts            # Canonical lead status contract
│   └── index.ts           # Lead type exports
├── index.css              # Google Fonts, design tokens, and responsive styles
└── main.tsx               # React entry point
```

The application currently has no backend, database, persistence layer, or external integration. Session lead records are kept in React state only and are cleared on refresh. The service layer is a future boundary; calling `getLeads()`, `getLead()`, `createLead()`, or `updateLead()` always rejects with `BackendNotConnectedError` until a backend is implemented.

## Routing and base-path preparation

The app uses `react-router-dom` with `BrowserRouter` and `import.meta.env.BASE_URL` for the basename. The route set is:

```text
/                → /dashboard
/dashboard        → Dashboard
/leads           → Leads
/discovery       → Discovery
/audits          → Audits
/analytics       → Analytics
/automation       → Automation
/settings        → Settings
```

Unknown paths render an empty-state not-found view. The Vite base follows `FIGMA_PUBLIC_URL` by default and also accepts an optional `VITE_BASE_PATH` override, such as `/app/`, for local testing. It does not add deployment configuration, rewrites, or server files. A hosting environment may later require SPA fallback routing, but the frontend does not currently provide it.

## Frontend boundaries

### Prism integration

The app uses a decorative [React Bits Prism](https://reactbits.dev/backgrounds/prism) background powered by OGL. It fills the viewport behind every page and keeps rotating while navigating. A dark overlay preserves readability. The background is hidden from assistive technology and does not intercept clicks. Reduced-motion users receive a static frame, and WebGL resources are released on unmount. If WebGL is unavailable, the interface remains usable against a black background. Offscreen pausing is available through the component's `suspendWhenOffscreen` prop.

Prism supports the supplied animation, geometry, color, glow, noise, offset, hover, and timing props. Zero-valued timing and intensity props are preserved, including `timeScale={0}` for a frozen rotation.

This project does not implement:

- Business discovery adapters or scrapers
- Database persistence
- API endpoints
- Audit or scoring engines
- AI model calls
- OpenRouter credentials
- Automation orchestration
- Autonomous outreach

Possible future domain API boundaries are listed below. These endpoints are proposals, not implemented routes or active frontend integrations:

```text
GET    /api/leads
GET    /api/leads/:id
POST   /api/discovery/run
GET    /api/discovery/runs
POST   /api/audits
POST   /api/scoring/calculate
POST   /api/ai/analyse/:businessId
GET    /api/automation/jobs
POST   /api/automation/run
```

## Responsible outreach

The intended workflow allows AI to assist with analysis and message generation only after validated deterministic scoring. Outreach must remain human approved. The current frontend neither generates nor sends messages; approval enforcement must be implemented when outreach services are connected.

## Design direction

The UI uses:

- Black backgrounds, white primary text, and red accents
- A borderless branched sidebar with centered pill navigation
- Translucent liquid-glass styling across the sidebar, header, cards, toolbars, board columns, and settings navigation, with backdrop blur and subtle highlights over the animated Prism background
- Dense but structured information layouts
- Strong typography and hierarchy
- IBM Plex Serif for headings and the logo, Manrope for body text, and DM Mono for numeric readouts and utility labels
- Explicit no-data and disconnected-service states
- Responsive tables and card-based mobile layouts
- Consistent dial cards across Analytics metrics, preserving percentage and count units
#   D e s i g n - B a n e l e . d e v - L e a d - I n t e l l i g e n c e - U I  
 