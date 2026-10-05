# RapidLink

RapidLink is an installable emergency-response application. A client starts a request, eligible on-duty responders receive an offer, and the first responder to accept owns the incident. A supervisor manages responder records and attendance.

The application is a React single-page PWA built with Vite, TypeScript and Tailwind CSS. Supabase provides PostgreSQL/PostGIS persistence and Vercel Functions provide the server API. The browser keeps an offline queue, but the server is authoritative whenever it is configured.

## Run locally

Requirements: Node.js 22 and npm 11.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to enter the client flow. Use `/session` only when you need to create or join a shared room. Separate tabs in the same browser continue to work if the network is disconnected.

## Frontend routes

- `http://localhost:5173/` — redirect to client registration or the emergency page
- `http://localhost:5173/session` — create or join a shared room
- `http://localhost:5173/register` — first-time client registration
- `http://localhost:5173/client` — client emergency request and live status
- `http://localhost:5173/client/profile` — edit client details or change the cancellation PIN
- `http://localhost:5173/supervisor` — station employee management
- `http://localhost:5173/supervisor/attendance` — daily attendance and shifts
- `http://localhost:5173/responder` — responder entry point
- `http://localhost:5173/responder/offers/{offerId}` — unique responder offer
- `http://localhost:5173/messages` — responder message inbox

Compatibility routes `/citizen`, `/dispatcher`, `/supervisor/employees`, and `/demo/sms` redirect to their current equivalents.

The plain Vite development server uses the local-only fallback because it does not run Vercel Functions. Use `vercel dev` when you need to exercise the Supabase-backed API locally, or test cross-device synchronization on the deployed preview.

## Response flow

1. Open `/` and register the client once. Use `/session` first only when a shared room is needed. The browser stores only a salted PBKDF2-derived cancellation PIN hash.
2. Open the Client interface and enable location or use the Ga-Rankuwa preset.
3. Press SOS or choose a service. The request is transmitted immediately to the closest appropriate station.
4. If nobody accepts after 30 seconds, the persisted scheduler notifies the next closest appropriate station. Earlier offers remain open and the first valid acceptance wins.
5. Open Responder Messages on another tab or device, then use the response link in the SMS message. The link includes the workspace code so the incident can load on a different browser.
6. Update the response through En route and Arrived. The responder requests closure, but the incident closes only after the client confirms that help was received.
7. To cancel, the client enters the six-digit cancellation PIN. A waiting request is cancelled immediately; an accepted request remains active until the assigned responder acknowledges the cancellation.

The Supervisor interface controls employee records and attendance. Reset room data returns the room to its initial seeded state.

## Cross-device rooms with Supabase

Create a Supabase project and apply both migrations in order:

1. [`supabase/migrations/001_rapidlink_sessions.sql`](supabase/migrations/001_rapidlink_sessions.sql)
2. [`supabase/migrations/20261005120000_rapidlink_operational_backend.sql`](supabase/migrations/20261005120000_rapidlink_operational_backend.sql)

The second migration adds the operational Postgres/PostGIS model, private profile/PIN records, immutable action history, incident events, responder offers, assignments and the SMS outbox. It also removes direct anonymous reads from the room table; browser reads and writes now pass through the server API.

Add these values to `.env.local` and the Vercel project:

```bash
VITE_APP_URL=https://your-project.vercel.app
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-secret-key
CRON_SECRET=a-long-random-server-secret
```

`SUPABASE_SERVICE_ROLE_KEY` is still accepted for older projects, but the current Supabase secret key is preferred. Both are server-only and must never use the `VITE_` prefix. All remote writes pass through Vercel Functions. If Supabase is unavailable or not configured, rooms fall back to local-only operation.

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
- `rapidlink_notification_outbox` is the integration boundary for a future SMS provider.
- `rapidlink_incident_events` provides an auditable incident timeline.
- Client profile and cancellation-PIN material are separated from operational incident records.

The action endpoint commits the room projection, normalized operational records and action log in one database transaction. Its compare-and-swap version check preserves first-accept-wins behavior when responders act concurrently.

## SMS integration path

The `/messages` screen currently renders the SMS outbox. Each alert contains the emergency type, reference, report time, response station, coordinates with accuracy, available situation/access notes, and a responder link. Client identity and next-of-kin details remain hidden until the responder accepts.

To connect a provider later, deploy a server-side worker that claims `queued` rows from `rapidlink_notification_outbox`, sends `message_body` to `recipient_phone`, and updates `delivery_status`, `sent_at` or `last_error`. Provider credentials must remain server-side. Delivery callbacks should be authenticated and idempotent.

The scheduled endpoint `/api/cron/escalations` processes persisted escalation deadlines. Vercel invokes it every minute as a safety worker. For the required 30-second cadence, configure Supabase Cron or another trusted scheduler to call it every 30 seconds with `Authorization: Bearer <CRON_SECRET>`. Browser recovery remains a secondary safeguard, not the only scheduler.

## PWA and offline behavior

The Vite PWA build generates the web manifest and service worker, precaches the application shell and hashed assets, and retains the designed offline route. Open the deployed HTTPS site and choose Install when prompted. Actions are applied locally and queued in order; they synchronize when connectivity returns.

Cross-device synchronization requires connectivity. Offline demonstrations work across tabs on the same installed device.

## Remaining production boundaries

- Profile registration is remembered only by the same browser/device store. Clearing browser data or using another device starts registration again unless a configured room is synchronized.
- The current workspace code is a collaboration capability, not user authentication. Production requires Supabase Auth (or an equivalent identity provider), role claims and explicit RLS policies for clients, responders and supervisors.
- PIN derivation currently starts in the browser for compatibility. Production cancellation verification and attempt throttling must move fully behind an authenticated server endpoint.
- SMS delivery is intentionally not connected. The outbox stores messages, but a provider worker and authenticated delivery callbacks are still required.
- The responder link is a prototype bearer link. Production links need short expiry, server-side token hashing, single-responder identity verification and revocation.
- Release of an assigned responder must be an atomic server transition based on authenticated completion, verified handover or audited supervisor override. A timer or client inactivity must never release a responder.
- The browser fallback is not a multi-device source of truth. Multi-device operation requires the configured API and database.

## Deployment

Import the repository into Vercel, select the Vite framework preset, add the environment variables above, and deploy. No root-directory override or separate backend deployment is required; Vercel deploys the functions in `/api` with the SPA.

```bash
npm run typecheck
npm run build
```
