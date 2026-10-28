import { PIN_LOCKOUT_MS, PIN_MAX_ATTEMPTS } from '../../../src/features/emergency/config.js';
import { applyEmergencyAction, normalizeEmergencyState, normalizeRoomCode } from '../../../src/features/emergency/session-service.js';
import type { EmergencyAction } from '../../../src/features/emergency/types.js';
import { clientAccessToken, verifyClientAccess } from '../../../src/lib/auth-server.js';
import { createPinRecord, verifyPin } from '../../../src/lib/pin-server.js';
import { commitSessionAction, getSession, supabaseConfigured } from '../../../src/lib/supabase-server.js';
import { bodyAs, firstQuery, methodNotAllowed, type ApiRequest, type ApiResponse } from '../../../src/lib/vercel-api.js';

interface PinBody { currentPin?: string; nextPin?: string }

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
  if (!supabaseConfigured) return response.status(503).json({ message: 'Remote sessions are not configured.' });
  const body = bodyAs<PinBody>(request);
  if (!/^\d{6}$/.test(body?.currentPin ?? '') || !/^\d{6}$/.test(body?.nextPin ?? '')) return response.status(400).json({ message: 'Both PINs must contain six digits.' });
  const currentPin = body!.currentPin!;
  const nextPin = body!.nextPin!;
  const code = normalizeRoomCode(firstQuery(request.query.code) ?? '');

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const record = await getSession(code);
      if (!record) return response.status(404).json({ message: 'Workspace not found.' });
      if (!await verifyClientAccess(record.id, clientAccessToken(request))) return response.status(403).json({ message: 'Client access is required.' });
      let state = normalizeEmergencyState(record.state);
      const security = state.profileSecurity;
      if (!security) return response.status(409).json({ message: 'A cancellation PIN has not been registered.' });
      const lockedUntil = security.lockedUntil ? Date.parse(security.lockedUntil) : 0;
      if (lockedUntil > Date.now()) return response.status(429).json({ ok: false, lockedForSeconds: Math.ceil((lockedUntil - Date.now()) / 1000), attemptsRemaining: 0, record });
      if (security.lockedUntil) state = applyEmergencyAction(state, { id: crypto.randomUUID(), type: 'clear-pin-failures', payload: {} });

      if (!verifyPin(currentPin, state.profileSecurity!)) {
        const failures = state.profileSecurity!.failedAttempts + 1;
        const lockedUntilIso = failures >= PIN_MAX_ATTEMPTS ? new Date(Date.now() + PIN_LOCKOUT_MS).toISOString() : undefined;
        const event: EmergencyAction = { id: crypto.randomUUID(), type: 'record-pin-failure', payload: { lockedUntil: lockedUntilIso } };
        const updated = await commitSessionAction(record, applyEmergencyAction(state, event), event);
        if (!updated) continue;
        return response.status(401).json({ ok: false, lockedForSeconds: lockedUntilIso ? Math.ceil(PIN_LOCKOUT_MS / 1000) : undefined, attemptsRemaining: Math.max(0, PIN_MAX_ATTEMPTS - failures), record: updated });
      }

      const event: EmergencyAction = { id: crypto.randomUUID(), type: 'change-pin', payload: { security: createPinRecord(nextPin) } };
      const updated = await commitSessionAction(record, applyEmergencyAction(state, event), event);
      if (!updated) continue;
      return response.status(200).json({ ok: true, attemptsRemaining: PIN_MAX_ATTEMPTS, record: updated });
    }
    return response.status(409).json({ message: 'The workspace changed too quickly. Retry the PIN change.' });
  } catch {
    return response.status(502).json({ message: 'The PIN could not be changed.' });
  }
}
