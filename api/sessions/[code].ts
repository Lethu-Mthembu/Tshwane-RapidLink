import { normalizeRoomCode } from '../../src/features/emergency/session-service.js';
import { clientAccessToken, redactStateForStaff, staffIdentity, verifyClientAccess } from '../../src/lib/auth-server.js';
import { getSession, supabaseConfigured } from '../../src/lib/supabase-server.js';
import { firstQuery, methodNotAllowed, type ApiRequest, type ApiResponse } from '../../src/lib/vercel-api.js';

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'GET') return methodNotAllowed(response, 'GET');
  if (!supabaseConfigured) return response.status(503).json({ message: 'Remote sessions are not configured.' });
  try {
    const code = normalizeRoomCode(firstQuery(request.query.code) ?? '');
    const record = await getSession(code);
    if (!record) return response.status(404).json({ message: 'Room not found.' });
    if (await verifyClientAccess(record.id, clientAccessToken(request))) return response.status(200).json(record);
    const identity = await staffIdentity(request, record.id, record.code);
    if (!identity) return response.status(401).json({ message: 'Authentication is required.' });
    return response.status(200).json({ ...record, state: redactStateForStaff(record.state, identity), staff: identity });
  } catch {
    return response.status(502).json({ message: 'The room could not be loaded.' });
  }
}
