import { applyEmergencyAction, normalizeEmergencyState } from '../../src/features/emergency/session-service.js';
import type { EmergencyAction, SessionRecord } from '../../src/features/emergency/types.js';
import { commitSessionAction, listDueSessions, listNotificationSessions, supabaseConfigured } from '../../src/lib/supabase-server.js';
import { methodNotAllowed, type ApiRequest, type ApiResponse } from '../../src/lib/vercel-api.js';
import { dispatchQueuedPushNotifications } from '../../src/lib/web-push-server.js';

function bearerToken(request: ApiRequest) {
  const value = request.headers.authorization;
  return Array.isArray(value) ? value[0] : value;
}

async function processSession(initial: SessionRecord) {
  let record = initial;
  let processed = 0;
  const safetyLimit = Math.max(1, record.state.stations.length * Math.max(1, record.state.incidents.length));

  for (let index = 0; index < safetyLimit; index += 1) {
    const state = normalizeEmergencyState(record.state);
    const incident = state.incidents.find((item) =>
      item.status === 'WAITING_FOR_RESPONDER' &&
      item.nextEscalationAt &&
      Date.parse(item.nextEscalationAt) <= Date.now());
    if (!incident?.nextEscalationAt) break;

    const event: EmergencyAction = {
      id: crypto.randomUUID(),
      type: 'escalate-incident',
      payload: { incidentId: incident.id, expectedDeadline: incident.nextEscalationAt },
    };
    const updated = await commitSessionAction(record, applyEmergencyAction(state, event), event);
    if (!updated) break;
    record = updated;
    processed += 1;
  }

  const push = await dispatchQueuedPushNotifications(record.id, record.code).catch(() => ({ submitted: 0, failed: 0, unregistered: 0, results: [] as Array<{ messageId: string; status: 'submitted' | 'failed' | 'no_subscription' }> }));
  for (const result of push.results) {
    const event: EmergencyAction = { id: crypto.randomUUID(), type: 'record-notification-result', payload: result };
    const updated = await commitSessionAction(record, applyEmergencyAction(normalizeEmergencyState(record.state), event), event);
    if (updated) record = updated;
  }
  return { processed, push };
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'GET' && request.method !== 'POST') return methodNotAllowed(response, 'GET, POST');
  if (!supabaseConfigured) return response.status(503).json({ message: 'Operational storage is not configured.' });

  const secret = process.env.CRON_SECRET;
  if (!secret) return response.status(503).json({ message: 'The escalation worker is not configured.' });
  if (bearerToken(request) !== `Bearer ${secret}`) return response.status(401).json({ message: 'Unauthorized.' });

  try {
    const [dueSessions, notificationSessions] = await Promise.all([listDueSessions(), listNotificationSessions()]);
    const sessions = [...new Map([...dueSessions, ...notificationSessions].map((session) => [session.id, session])).values()];
    const results = await Promise.all(sessions.map(processSession));
    return response.status(200).json({
      sessionsChecked: sessions.length,
      escalationsProcessed: results.reduce((sum, value) => sum + value.processed, 0),
      notificationsSubmitted: results.reduce((sum, value) => sum + value.push.submitted, 0),
      notificationFailures: results.reduce((sum, value) => sum + value.push.failed + value.push.unregistered, 0),
    });
  } catch {
    return response.status(502).json({ message: 'Escalation processing failed.' });
  }
}
