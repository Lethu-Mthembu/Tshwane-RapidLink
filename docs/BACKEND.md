# RapidLink backend

## Purpose

The backend is an incremental extension of the existing React application. It keeps the current `EmergencyState` response contract so the working screens do not need to be rebuilt, while PostgreSQL stores operational records in normalized tables.

The compatibility JSON document is not the long-term domain model. A database trigger projects every committed version into stations, responders, attendance, profiles, incidents, station notifications, responder offers, assignments, messages and audit events. This makes the current application deployable without freezing the future API around one large JSON column.

## Request path

```text
React PWA
  -> Vercel Function /api/sessions/:code/actions
  -> server reducer validates the requested transition
  -> rapidlink_commit_session_action(...)
  -> PostgreSQL row lock and version check
  -> room projection + action log + normalized projection in one transaction
  -> polling response updates every open browser
```

The database function is `security invoker`, executable only by `service_role`. The Supabase secret stays in the server environment. Anonymous and authenticated Data API roles have no table grants on operational data.

## First-response acceptance

Every action carries a unique action ID. The server retries on version conflicts. The database locks the room row, checks the expected version, and stores the action ID with the update. Two responders cannot commit the same version. After the first acceptance commits, the retry sees the assigned responder and closes competing offers.

This is safe for the current room-scoped application. The next hardening step is a dedicated `accept_offer(token, responder_user_id)` database transaction backed by Supabase Auth so acceptance is independent of the compatibility state document.

## Simulated SMS now, provider later

`rapidlink_notification_outbox` is the provider boundary. Current rows use:

- `channel = sms`
- `provider = simulated`
- `delivery_status = simulated`
- the responder's phone number
- complete operational message text
- a response path to the offer

The React `/messages` route is an outbox viewer. It does not send a carrier SMS.

A future SMS worker must:

1. Atomically claim queued outbox rows.
2. Send the stored body and absolute response URL through the configured provider.
3. Store the provider message ID, success time or sanitized failure.
4. Retry transient failures with a bounded backoff.
5. Authenticate provider delivery callbacks and make them idempotent.

Do not send a client's ID number, cancellation PIN material or next-of-kin details in SMS. The responder app may reveal private contact details only after the assigned responder has authenticated and accepted the incident.

## Escalation worker

`/api/cron/escalations` processes every due `WAITING_FOR_RESPONDER` incident and uses the same versioned action path as browser actions. It requires `CRON_SECRET` as a bearer token.

The Vercel Hobby plan only permits daily cron schedules, so `vercel.json` deliberately does not register this worker as a Vercel Cron Job. The deployed environment instead uses Supabase Cron to call the protected endpoint every 30 seconds. Keep the scheduler secret in a managed secret store and never expose it to browser code.

## Security debt that remains

- Six-character workspace codes are not identities and are vulnerable to guessing at sufficient scale.
- The compatibility session GET route returns the room projection to anyone who knows the code.
- Browser-derived PIN data is stored server-side, but PIN verification is not yet exclusively server-side.
- Responder offer URLs are capability links without responder identity verification or expiry.
- Supervisor changes are not tied to an authenticated supervisor account.
- The projection trigger rebuilds a small room's normalized rows on each change. It is deliberately simple and auditable, but write cost grows with room size. Replace it with direct per-aggregate commands before high-volume operation.

These are deployment blockers for a public emergency service. They do not prevent controlled prototype use, but they must not be disguised as production authorization.
