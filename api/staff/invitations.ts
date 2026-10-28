import { randomBytes } from 'node:crypto';

import { normalizeRoomCode } from '../../src/features/emergency/session-service.js';
import { hashAccessToken, staffIdentity, getSupabaseServerUrl, serviceRequestHeaders } from '../../src/lib/auth-server.js';
import { getSession } from '../../src/lib/supabase-server.js';
import { bodyAs, methodNotAllowed, type ApiRequest, type ApiResponse } from '../../src/lib/vercel-api.js';

interface InvitationBody { code?: string; employeeId?: string; email?: string }

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
  const body = bodyAs<InvitationBody>(request);
  const code = normalizeRoomCode(body?.code ?? '');
  const session = await getSession(code);
  if (!session) return response.status(404).json({ message: 'Workspace not found.' });
  const supervisor = await staffIdentity(request, session.id, session.code);
  if (supervisor?.role !== 'supervisor') return response.status(403).json({ message: 'Supervisor access is required.' });
  const employee = session.state.employees.find((item) => item.id === body?.employeeId && item.stationId === supervisor.stationId);
  const email = body?.email?.trim().toLowerCase() ?? '';
  if (!employee || !email) return response.status(400).json({ message: 'A responder and work email are required.' });
  const token = randomBytes(32).toString('base64url');
  const url = getSupabaseServerUrl();
  if (!url) return response.status(503).json({ message: 'Staff authentication is not configured.' });
  const invitation = await fetch(`${url}/rest/v1/rapidlink_staff_invitations`, {
    method: 'POST',
    headers: serviceRequestHeaders({ 'content-type': 'application/json', prefer: 'return=minimal' }),
    body: JSON.stringify({
      session_id: session.id,
      employee_key: employee.id,
      station_key: employee.stationId,
      role: 'responder',
      email,
      token_hash: hashAccessToken(token),
      expires_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
      created_by: supervisor.userId,
    }),
  });
  if (!invitation.ok) return response.status(502).json({ message: 'The access invitation could not be created.' });
  const appUrl = (process.env.VITE_APP_URL ?? `https://${request.headers.host ?? ''}`).replace(/\/$/, '');
  return response.status(201).json({ activationUrl: `${appUrl}/staff/activate?session=${encodeURIComponent(code)}&token=${encodeURIComponent(token)}`, expiresInHours: 24 });
}
