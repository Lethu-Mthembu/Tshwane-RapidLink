import { normalizeEmergencyState, normalizeRoomCode, applyEmergencyAction } from '../../src/features/emergency/session-service.js';
import type { EmergencyAction } from '../../src/features/emergency/types.js';
import { hashAccessToken, getSupabaseServerUrl, serviceRequestHeaders } from '../../src/lib/auth-server.js';
import { commitSessionAction, getSession } from '../../src/lib/supabase-server.js';
import { bodyAs, methodNotAllowed, type ApiRequest, type ApiResponse } from '../../src/lib/vercel-api.js';

interface ActivateBody { code?: string; token?: string; password?: string }
interface InvitationRow { id: string; session_id: string; employee_key: string; station_key: string; role: 'responder' | 'supervisor'; email: string; expires_at: string; used_at: string | null }

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
  const body = bodyAs<ActivateBody>(request);
  const code = normalizeRoomCode(body?.code ?? '');
  if (code.length !== 6 || !body?.token || !body.password || body.password.length < 12) return response.status(400).json({ message: 'A valid invitation and 12-character password are required.' });
  const session = await getSession(code);
  if (!session) return response.status(404).json({ message: 'Workspace not found.' });
  const url = getSupabaseServerUrl();
  if (!url) return response.status(503).json({ message: 'Staff authentication is not configured.' });
  const invitationResponse = await fetch(`${url}/rest/v1/rpc/rapidlink_consume_staff_invitation`, {
    method: 'POST',
    headers: serviceRequestHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ p_session_id: session.id, p_token_hash: hashAccessToken(body.token) }),
  });
  if (!invitationResponse.ok) return response.status(502).json({ message: 'The invitation could not be checked.' });
  const invitation = (await invitationResponse.json() as InvitationRow[])[0];
  if (!invitation || Date.parse(invitation.expires_at) <= Date.now()) return response.status(410).json({ message: 'This invitation is invalid, expired or already used.' });
  const created = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: serviceRequestHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ email: invitation.email, password: body.password, email_confirm: true, app_metadata: { rapidlink_role: 'staff' } }),
  });
  if (!created.ok) {
    await fetch(`${url}/rest/v1/rapidlink_staff_invitations?id=eq.${invitation.id}`, { method: 'PATCH', headers: serviceRequestHeaders({ 'content-type': 'application/json' }), body: JSON.stringify({ used_at: null }) });
    return response.status(400).json({ message: 'The staff account could not be activated.' });
  }
  const user = await created.json() as { id: string };
  const membership = await fetch(`${url}/rest/v1/rapidlink_staff_members`, {
    method: 'POST',
    headers: serviceRequestHeaders({ 'content-type': 'application/json', prefer: 'return=minimal' }),
    body: JSON.stringify({ session_id: session.id, auth_user_id: user.id, role: invitation.role, station_key: invitation.station_key, employee_key: invitation.employee_key, email: invitation.email }),
  });
  if (!membership.ok) {
    await fetch(`${url}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: serviceRequestHeaders() });
    await fetch(`${url}/rest/v1/rapidlink_staff_invitations?id=eq.${invitation.id}`, { method: 'PATCH', headers: serviceRequestHeaders({ 'content-type': 'application/json' }), body: JSON.stringify({ used_at: null }) });
    return response.status(502).json({ message: 'Responder access could not be attached. No account was retained.' });
  }
  const state = normalizeEmergencyState(session.state);
  const employee = state.employees.find((item) => item.id === invitation.employee_key);
  if (employee) {
    const event: EmergencyAction = { id: crypto.randomUUID(), type: 'update-employee', payload: { employee: { ...employee, workEmail: invitation.email, accessEnabled: true } } };
    await commitSessionAction(session, applyEmergencyAction(state, event), event);
  }
  return response.status(201).json({ message: 'Responder access activated.', email: invitation.email });
}
