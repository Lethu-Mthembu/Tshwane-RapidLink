# RapidLink

RapidLink is an installable emergency-response application with a React/Tailwind PWA and a Node/Supabase backend. Clients create emergency requests, eligible responders receive station-scoped offers, and the backend enforces first-valid-acceptance ownership and responder release.

## Local setup

Requirements: Node.js 22 and npm 11.

```bash
npm install
copy .env.example .env.local
npm run dev
```

The Vite development server starts at [http://localhost:5173](http://localhost:5173). It does not execute the server API. For a production-style local run, configure the server variables, then use:

```bash
npm run build
npm start
```

## Routes

- `/register` — first-time client registration
- `/client` — client emergency request and live response status
- `/client/profile` — client profile and cancellation-PIN management
- `/staff/bootstrap` — one-time first-administrator creation
- `/staff/sign-in` — administrator, supervisor and responder sign-in
- `/staff/activate` — one-time staff invitation acceptance
- `/admin` — organisation administrator and supervisor invitations
- `/supervisor` — the signed-in supervisor's station/service responder directory
- `/supervisor/attendance` — station/service attendance and shifts
- `/supervisor/analytics` — station/service readiness aggregates
- `/messages` — responder offer inbox
- `/responder/offers/:offerId` — responder offer and active-response workflow

There is no login route for clients and no user-created workspace/session page. The client application maintains an internal response channel for cross-device synchronization; that implementation key is not an authorization mechanism and is not shown as an operational workflow.

## Staff ownership and onboarding

Staff ownership is permanent and backend-enforced:

```text
Organisation
  -> physical station + service
      -> supervisors
      -> responders
```

- The first administrator is created once at `/staff/bootstrap` using `RAPIDLINK_BOOTSTRAP_SECRET`.
- Administrators invite additional administrators or station/service-scoped supervisors.
- Multiple supervisors may coexist in one station/service scope.
- A supervisor can only view and invite responders in the supervisor's own station/service scope.
- No responder placeholder is created when an invitation is issued. Invitation acceptance atomically creates the Supabase Auth user, permanent staff account and responder record.
- Supervisor screens expose responder readiness and aggregate operational counts. They do not expose client identity, live location, incident descriptions or attachments.

Invitation emails are sent through Resend from the configured `trainmate.nemasites.com` sender. If email delivery fails, the pending invitation is revoked instead of leaving a usable undistributed token.

## Emergency dispatch

1. The registered client submits a police, ambulance, fire or SOS request.
2. SOS creates two linked but independent dispatches: one police dispatch and one ambulance dispatch. They have separate offers, assignments, escalation and status.
3. The nearest appropriate station receives offers for responders who are active, on duty and available.
4. If nobody accepts by the escalation deadline, the backend expands the search to the next appropriate station. Previous offers remain active.
5. The first valid acceptance wins. A server-side responder assignment prevents that responder from accepting another active call from any client channel.
6. A responder is released only after a terminal cancellation/completion transition, verified handover or client confirmation that help was received.

## Backend model

The backend code is in `/api`, `/server` and `/src/lib`:

- `/api/staff` — bootstrap, sign-in identity, invitations, permanent directory and attendance operations
- `/api/sessions` — client incident commands, cancellation and responder actions
- `/api/cron/escalations` — persisted escalation processing
- `/server/index.ts` — Render Node service, API routing, SPA delivery and escalation sweep
- `/src/lib/auth-server.ts` — authenticated staff identity, authorization and global responder assignment
- `/src/lib/supabase-server.ts` — Supabase persistence and compatibility projection hydration
- `/src/lib/resend-server.ts` — server-only Resend email delivery
- `/supabase/migrations` — PostgreSQL schema and data migrations

The current React screens still consume a session-state projection for incident synchronization. Staff accounts, station/service ownership, attendance, push subscriptions and responder availability are permanent normalized records. Supabase service-role access bypasses RLS, so station/service ownership is enforced in both the Node authorization layer and database triggers.

## Supabase migration

Apply migrations in filename order. The permanent staff migration is:

```text
supabase/migrations/20261029143000_permanent_station_staff_model.sql
```

That migration deliberately removes legacy seeded responders, responder attendance, old staff memberships/invitations, offers, assignments, notification artifacts and responder data embedded in session projections. It retains station records and the client profile/incident tables. The legacy Auth user must be removed separately through Supabase Authentication because PostgreSQL migrations should not silently delete Auth identities.

## Environment variables

Browser-safe variables:

```bash
VITE_APP_URL=https://your-deployment.example
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-browser-safe-publishable-key
VITE_VAPID_PUBLIC_KEY=your-vapid-public-key
```

Server-only variables:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-secret-key
RAPIDLINK_APP_URL=https://your-deployment.example
RAPIDLINK_BOOTSTRAP_SECRET=a-long-random-one-time-bootstrap-secret
CRON_SECRET=a-separate-long-random-secret
RESEND_API_KEY=your-resend-api-key
RESEND_FROM_EMAIL=RapidLink Access <access@trainmate.nemasites.com>
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_SUBJECT=https://your-deployment.example
```

`SUPABASE_SERVICE_ROLE_KEY` remains supported for older projects, but `SUPABASE_SECRET_KEY` is preferred. Never expose either key, `RESEND_API_KEY`, `CRON_SECRET` or `RAPIDLINK_BOOTSTRAP_SECRET` through a `VITE_` variable.

The Resend domain must be verified before invitation email can be delivered. Until `RESEND_API_KEY` is configured, staff invitation creation intentionally returns `503`.

## Render deployment

Deploy this repository as one Node Web Service, not as a Static Site:

- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Health check: `/healthz`
- Branch: `main`
- Runtime: Node

The service binds to Render's `PORT`, serves the PWA, exposes `/api`, and runs a non-overlapping escalation sweep while the process is awake. A sleeping free service cannot guarantee a 30-second dispatch SLA; an always-on service or trusted scheduler is required before treating escalation timing as operationally reliable.

## Production boundaries

- Resend provides email onboarding only; real SMS delivery is not implemented.
- Browser push is best-effort and must have monitored fallback channels for production use.
- The compatibility incident projection should eventually be replaced with narrow per-command database procedures and immutable incident events.
- Cancellation PIN verification belongs on the backend, but account recovery still requires verified email/phone ownership and explicit device management.
- Internal client response channels are synchronization identifiers, not production authorization boundaries.
- Supabase and the Render API are authoritative across devices; offline browser state alone is not.
- The free Render tier cannot provide an emergency-grade availability or latency guarantee.
