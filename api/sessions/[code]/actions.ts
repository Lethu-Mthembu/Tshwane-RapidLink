import { applyEmergencyAction, normalizeEmergencyState, normalizeRoomCode } from '../../../src/features/emergency/session-service.js';
import type { EmergencyAction } from '../../../src/features/emergency/types.js';
import { authorizeAction, claimResponderAssignment, persistResponderOperationalAction, redactStateForStaff, releaseResponderAssignment } from '../../../src/lib/auth-server.js';
import { commitSessionAction, getSession, supabaseConfigured } from '../../../src/lib/supabase-server.js';
import { dispatchQueuedPushNotifications } from '../../../src/lib/web-push-server.js';
import { bodyAs, firstQuery, methodNotAllowed, type ApiRequest, type ApiResponse } from '../../../src/lib/vercel-api.js';

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
  if (!supabaseConfigured) return response.status(503).json({ message: 'Remote sessions are not configured.' });
  const event = bodyAs<EmergencyAction>(request);
  if (!event?.id || !event.type || !event.payload) return response.status(400).json({ message: 'Invalid action.' });
  const code = normalizeRoomCode(firstQuery(request.query.code) ?? '');
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const record = await getSession(code);
      if (!record) return response.status(404).json({ message: 'Response channel not found.' });
      const actor = await authorizeAction(request, record.id, record.code, normalizeEmergencyState(record.state), event);
      if (!actor) return response.status(403).json({ message: 'You are not allowed to perform this action.' });
      const offer = event.type === 'accept-offer' ? record.state.offers.find((item) => item.id === event.payload.offerId) : undefined;
      let claimed = false;
      if (event.type === 'accept-offer' && actor.kind === 'staff' && offer) {
        claimed = await claimResponderAssignment(actor.identity, record.id, offer.incidentId);
        if (!claimed) return response.status(409).json({ message: 'You are already assigned to another active response or are not available.' });
      }
      let updated;
      try {
        updated = await commitSessionAction(record, applyEmergencyAction(normalizeEmergencyState(record.state), event), event);
      } catch (reason) {
        if (claimed && actor.kind === 'staff' && offer) await releaseResponderAssignment(actor.identity.employeeId!, record.id, offer.incidentId);
        throw reason;
      }
      if (updated) {
        if (actor.kind === 'staff') await persistResponderOperationalAction(actor.identity, event);
        const previousIncidents = new Map(record.state.incidents.map((incident) => [incident.id, incident]));
        for (const incident of updated.state.incidents) {
          const previous = previousIncidents.get(incident.id);
          if (previous?.assignedEmployeeId && !['CANCELLED', 'COMPLETED'].includes(previous.status) && ['CANCELLED', 'COMPLETED'].includes(incident.status)) {
            await releaseResponderAssignment(previous.assignedEmployeeId, record.id, incident.id);
          }
        }
        let latest = updated;
        const push = await dispatchQueuedPushNotifications(updated.id, updated.code).catch(() => null);
        for (const result of push?.results ?? []) {
          const notificationEvent: EmergencyAction = { id: crypto.randomUUID(), type: 'record-notification-result', payload: result };
          const committed = await commitSessionAction(latest, applyEmergencyAction(normalizeEmergencyState(latest.state), notificationEvent), notificationEvent);
          if (committed) latest = committed;
        }
        return response.status(200).json(actor.kind === 'staff' ? { ...latest, state: redactStateForStaff(latest.state, actor.identity) } : latest);
      }
      if (claimed && actor.kind === 'staff' && offer) await releaseResponderAssignment(actor.identity.employeeId!, record.id, offer.incidentId);
    }
    return response.status(409).json({ message: 'The response changed too quickly. Retry the action.' });
  } catch {
    return response.status(502).json({ message: 'The action could not be synchronized.' });
  }
}
