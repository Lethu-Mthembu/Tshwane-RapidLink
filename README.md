# RapidLink

RapidLink is an installable emergency-response application. A client starts a request, eligible on-duty responders receive an offer, and the first responder to accept owns the incident. A supervisor manages responder records and attendance.

The application is a React single-page PWA built with Vite, TypeScript and Tailwind CSS. Supabase provides PostgreSQL/PostGIS persistence. The API can run as Vercel Functions or through the Node web server used by Render. The browser keeps an offline queue, but the server is authoritative whenever it is configured.

## Run locally

Requirements: Node.js 22 and npm 11.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to enter the client flow. Use `/session` to create an operations workspace. Staff join through authenticated accounts; a workspace code alone does not grant access.

## Frontend routes

- `http://localhost:5173/` — redirect to client registration or the emergency page
- `http://localhost:5173/session` — create an operations workspace and open staff onboarding links
- `http://localhost:5173/register` — first-time client registration
- `http://localhost:5173/client` — client emergency request and live status
- `http://localhost:5173/client/profile` — edit client details or change the cancellation PIN
- `http://localhost:5173/staff/sign-in` — responder and supervisor sign-in
- `http://localhost:5173/staff/activate` — one-time responder account activation
- `http://localhost:5173/staff/bootstrap` — one-time first-supervisor setup
- `http://localhost:5173/supervisor` — station employee and app-access management
- `http://localhost:5173/supervisor/attendance` — daily attendance and shifts
- `http://localhost:5173/responder` — responder entry point
- `http://localhost:5173/responder/offers/{offerId}` — unique responder offer
- `http://localhost:5173/messages` — responder message inbox

Compatibility routes `/citizen`, `/dispatcher`, `/supervisor/employees`, and `/demo/sms` redirect to their current equivalents.

The plain Vite development server uses the local-only fallback because it does not run the API. To run the production-style Node server locally, build first and then run `npm start` with the required environment variables configured.

## Response flow

1. Open `/` and register the client once. Use `/session` first only when a shared room is needed. The browser stores only a salted PBKDF2-derived cancellation PIN hash.
2. Open the Client interface and enable location or use the Ga-Rankuwa preset.
3. Press SOS or choose a service. The request is transmitted immediately to the closest appropriate station.
4. If nobody accepts after 30 seconds, the persisted scheduler notifies the next closest appropriate station. Earlier offers remain open and the first valid acceptance wins.
5. The supervisor creates a one-time activation link for each responder. The responder signs in, marks themselves available and enables device notifications. In-app notification is the primary channel; SMS is reserved as a future fallback.
6. The responder opens an offer, accepts it, and updates the response through En route and Arrived. The responder requests closure, but the incident closes only after the client confirms that help was received, a verified handover is recorded, or a supervisor uses an audited override.
7. To cancel, the client enters the six-digit cancellation PIN. A waiting request is cancelled immediately; an accepted request remains active until the assigned responder acknowledges the cancellation.

The Supervisor interface controls employee records and attendance. Reset room data returns the room to its initial seeded state.

## Cross-device rooms with Supabase

Create a Supabase project and apply the migrations in order:

1. [`supabase/migrations/001_rapidlink_sessions.sql`](supabase/migrations/001_rapidlink_sessions.sql)
2. [`supabase/migrations/20261005120000_rapidlink_operational_backend.sql`](supabase/migrations/20261005120000_rapidlink_operational_backend.sql)
3. [`supabase/migrations/20261027232052_phase_1_identity_notifications_readiness.sql`](supabase/migrations/20261027232052_phase_1_identity_notifications_readiness.sql)

The Phase 1 migration adds authenticated staff membership, one-time invitations, push subscriptions, responder readiness, handover records, notification delivery state and stricter service-role-only database access.

Add these values to `.env.local` and the selected deployment platform:

```bash
VITE_APP_URL=https://your-deployment.example
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-browser-safe-publishable-key
VITE_VAPID_PUBLIC_KEY=your-vapid-public-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-secret-key
CRON_SECRET=a-long-random-server-secret
RAPIDLINK_BOOTSTRAP_SECRET=a-separate-long-random-secret
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_SUBJECT=https://your-deployment.example
```

`SUPABASE_SERVICE_ROLE_KEY` is still accepted for older projects, but the current Supabase secret key is preferred. Both are server-only and must never use the `VITE_` prefix. All remote writes pass through the server API. If Supabase is unavailable or not configured, rooms fall back to local-only operation.

Apply migrations with the Supabase CLI after linking the project:

```bash
npx supabase link --project-ref your-project-ref
npx supabase db push
```

## Backend model

- `rapidlink_sessions` remains the compatibility projection consumed by the existing React screens.
- `rapidlink_action_log` makes client actions idempotent and records the server mutation history.
- `rapidlink_stations` and `rapidlink_incidents` use PostGIS geography columns for future authoritative nearest-station queries.
- `rapidlink_employees` and `rapidlink_attendance` determine responder eligibility.
- `rapidlink_responder_offers` enforces one offer per responder per incident.
- `rapidlink_assignments` records the responder who won acceptance and when that responder is released.
- `rapidlink_staff_members` ties Supabase Auth users to a workspace, role, station and responder record.
- `rapidlink_staff_invitations` stores hashed, single-use responder activation tokens.
- `rapidlink_push_subscriptions` stores staff device subscriptions for standards-based Web Push.
- `rapidlink_notification_outbox` records in-app notification delivery attempts and remains the integration boundary for a future SMS fallback.
- `rapidlink_incident_events` provides an auditable incident timeline.
- Client profile and cancellation-PIN material are separated from operational incident records.

The action endpoint commits the room projection, normalized operational records and action log in one database transaction. Its compare-and-swap version check preserves first-accept-wins behavior when responders act concurrently.

## Staff access and notifications

Create the first supervisor at `/staff/bootstrap` using the deployment-only `RAPIDLINK_BOOTSTRAP_SECRET`. The endpoint closes after the first active supervisor exists. Supervisors create 24-hour, one-time activation links for responders. Passwords are managed by Supabase Auth and are never stored in the RapidLink session state.

Web Push uses the free browser Push API and VAPID keys. Notifications contain only a generic incident alert and a link; operational details are loaded after authenticated access. If a device has no subscription, the in-app inbox remains available. A future SMS provider can consume failed or undelivered outbox records as a fallback, but SMS is not the primary channel.

The scheduled endpoint `/api/cron/escalations` processes persisted escalation deadlines. The Render Node service also performs a non-overlapping sweep every 30 seconds while its process is running. A free Render service sleeps after inactivity, so production still requires an always-on worker or another trusted scheduler. Browser recovery remains a secondary safeguard, not the only scheduler.

## PWA and offline behavior

The Vite PWA build generates the web manifest and service worker, precaches the application shell and hashed assets, and retains the designed offline route. Open the deployed HTTPS site and choose Install when prompted. Actions are applied locally and queued in order; they synchronize when connectivity returns.

Cross-device synchronization requires connectivity. Offline demonstrations work across tabs on the same installed device.

## Remaining production boundaries

- A client workspace token is stored only on the creating browser/device. Clearing browser data loses that client capability. Production needs verified client account recovery and explicit device management.
- Staff access is authenticated, but the compatibility session JSON remains a broad projection. A later backend hardening phase should replace projection mutation with narrow database commands and per-entity authorization.
- Cancellation PIN verification and throttling run on the server, but this is still not a complete account-recovery system. No fake frontend-only PIN recovery is provided.
- Browser push delivery is best-effort and platform-dependent. A production service needs monitored fallback channels and delivery escalation; real SMS incurs provider cost.
- The free Render web service sleeps after inactivity and can take about a minute to restart. Its in-process 30-second sweep is therefore not a production scheduling guarantee. A production 30-second SLA needs an always-on worker or scheduler.
- Handover and supervisor override release responders atomically in the current compatibility transaction. Production should add receiving-facility identity, immutable audit retention and operational review.
- The browser fallback is not authoritative across devices. Cross-device operation requires the configured API and database.

## Render deployment

Deploy the repository as one Node Web Service. Do not use a Static Site: the operational `/api` routes require server-side execution.

- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Health check: `/healthz`
- Runtime: Node
- Branch: `main`

The server binds to Render's `PORT`, serves `dist`, preserves SPA routing, exposes the existing API routes and runs the escalation sweep while the instance is awake. Configure all environment variables listed above, set `VITE_APP_URL` and `VAPID_SUBJECT` to the final Render HTTPS URL, and keep all secret values out of Git.

## Vercel deployment

Import the repository into Vercel, select the Vite framework preset, add the environment variables above, and deploy. No root-directory override or separate backend deployment is required; Vercel deploys the functions in `/api` with the SPA.

```bash
npm run typecheck
npm run build
npm start
```
