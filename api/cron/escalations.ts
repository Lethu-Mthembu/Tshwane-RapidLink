import { applyEmergencyAction, normalizeEmergencyState } from '../../src/features/emergency/session-service.js';
import type { EmergencyAction, SessionRecord } from '../../src/features/emergency/types.js';
import { commitSessionAction, listDueSessions, supabaseConfigured } from '../../src/lib/supabase-server.js';
import { methodNotAllowed, type ApiRequest, type ApiResponse } from '../../src/lib/vercel-api.js';

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

  return processed;
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'GET' && request.method !== 'POST') return methodNotAllowed(response, 'GET, POST');
  if (!supabaseConfigured) return response.status(503).json({ message: 'Operational storage is not configured.' });

  const secret = process.env.CRON_SECRET;
  if (!secret) return response.status(503).json({ message: 'The escalation worker is not configured.' });
  if (bearerToken(request) !== `Bearer ${secret}`) return response.status(401).json({ message: 'Unauthorized.' });

  try {
    const sessions = await listDueSessions();
    const results = await Promise.all(sessions.map(processSession));
    return response.status(200).json({ sessionsChecked: sessions.length, escalationsProcessed: results.reduce((sum, value) => sum + value, 0) });
  } catch {
    return response.status(502).json({ message: 'Escalation processing failed.' });
  }
}
