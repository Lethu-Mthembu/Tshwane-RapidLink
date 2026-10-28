import { createInitialState } from '../src/features/emergency/fixtures.js';
import { generateRoomCode, normalizeRoomCode } from '../src/features/emergency/session-service.js';
import { hashAccessToken, newClientAccessToken } from '../src/lib/auth-server.js';
import { purgeExpiredSessions, supabaseConfigured, upsertSession } from '../src/lib/supabase-server.js';
import { bodyAs, methodNotAllowed, type ApiRequest, type ApiResponse } from '../src/lib/vercel-api.js';

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
  if (!supabaseConfigured) return response.status(503).json({ message: 'Remote sessions are not configured.' });
  const body = bodyAs<{ code?: string }>(request) ?? {};
  const code = normalizeRoomCode(body.code ?? generateRoomCode());
  if (code.length !== 6) return response.status(400).json({ message: 'A six-character code is required.' });
  try {
    await purgeExpiredSessions();
    const clientToken = newClientAccessToken();
    const record = await upsertSession(code, createInitialState(), hashAccessToken(clientToken));
    return response.status(200).json({ ...record, clientToken });
  } catch {
    return response.status(502).json({ message: 'The room could not be created.' });
  }
}
