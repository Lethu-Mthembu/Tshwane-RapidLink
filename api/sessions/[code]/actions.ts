import { applyEmergencyAction, normalizeEmergencyState, normalizeRoomCode } from '../../../src/features/emergency/session-service.js';
import type { EmergencyAction } from '../../../src/features/emergency/types.js';
import { commitSessionAction, getSession, supabaseConfigured } from '../../../src/lib/supabase-server.js';
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
      if (!record) return response.status(404).json({ message: 'Room not found.' });
      const updated = await commitSessionAction(record, applyEmergencyAction(normalizeEmergencyState(record.state), event), event);
      if (updated) return response.status(200).json(updated);
    }
    return response.status(409).json({ message: 'The room changed too quickly. Retry the action.' });
  } catch {
    return response.status(502).json({ message: 'The action could not be synchronized.' });
  }
}
