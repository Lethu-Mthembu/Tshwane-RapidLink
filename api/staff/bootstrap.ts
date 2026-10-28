import { timingSafeEqual } from 'node:crypto';

import { normalizeRoomCode } from '../../src/features/emergency/session-service.js';
import { getSupabaseServerUrl, serviceRequestHeaders } from '../../src/lib/auth-server.js';
import { getSession, supabaseConfigured } from '../../src/lib/supabase-server.js';
import { bodyAs, methodNotAllowed, type ApiRequest, type ApiResponse } from '../../src/lib/vercel-api.js';

interface BootstrapBody { code?: string; email?: string; password?: string; stationId?: string; bootstrapSecret?: string }

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
  if (!supabaseConfigured) return response.status(503).json({ message: 'Staff authentication is not configured.' });
  const body = bodyAs<BootstrapBody>(request);
  const configuredSecret = process.env.RAPIDLINK_BOOTSTRAP_SECRET ?? '';
  if (!body?.bootstrapSecret || !configuredSecret || !safeEqual(body.bootstrapSecret, configuredSecret)) return response.status(403).json({ message: 'Invalid bootstrap secret.' });
  const code = normalizeRoomCode(body.code ?? '');
  const email = body.email?.trim().toLowerCase() ?? '';
  if (code.length !== 6 || !email || !body.password || body.password.length < 12 || !body.stationId) return response.status(400).json({ message: 'Workspace, station, email and a 12-character password are required.' });
  const session = await getSession(code);
  if (!session) return response.status(404).json({ message: 'Workspace not found.' });
  if (!session.state.stations.some((station) => station.id === body.stationId)) return response.status(400).json({ message: 'Station is not part of this workspace.' });
  const url = getSupabaseServerUrl();
  if (!url) return response.status(503).json({ message: 'Staff authentication is not configured.' });
  const existing = await fetch(`${url}/rest/v1/rapidlink_staff_members?session_id=eq.${session.id}&role=eq.supervisor&active=eq.true&select=id&limit=1`, { headers: serviceRequestHeaders(), cache: 'no-store' });
  if (!existing.ok) return response.status(502).json({ message: 'Supervisor access could not be checked.' });
  if ((await existing.json() as unknown[]).length) return response.status(409).json({ message: 'A supervisor already exists for this workspace.' });
  const created = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: serviceRequestHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ email, password: body.password, email_confirm: true, app_metadata: { rapidlink_role: 'staff' } }),
  });
  if (!created.ok) return response.status(400).json({ message: 'The supervisor account could not be created.' });
  const user = await created.json() as { id: string };
  const membership = await fetch(`${url}/rest/v1/rapidlink_staff_members`, {
    method: 'POST',
    headers: serviceRequestHeaders({ 'content-type': 'application/json', prefer: 'return=minimal' }),
    body: JSON.stringify({ session_id: session.id, auth_user_id: user.id, role: 'supervisor', station_key: body.stationId, email }),
  });
  if (!membership.ok) {
    await fetch(`${url}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: serviceRequestHeaders() });
    return response.status(502).json({ message: 'Supervisor access could not be attached. No account was retained.' });
  }
  return response.status(201).json({ message: 'Supervisor access created.' });
}
