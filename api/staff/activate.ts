import { getSupabaseServerUrl, hashAccessToken, serviceRequestHeaders } from '../../src/lib/auth-server.js';
import { bodyAs, methodNotAllowed, type ApiRequest, type ApiResponse } from '../../src/lib/vercel-api.js';

interface ActivateBody { token?: string; password?: string }
interface InvitationRow {
  id: string;
  organisation_id: string;
  role: 'admin' | 'supervisor' | 'responder';
  station_service_id: string | null;
  email: string;
  employee_number: string | null;
  responder_name: string | null;
  responder_surname: string | null;
  responder_phone: string | null;
  expires_at: string;
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
  const body = bodyAs<ActivateBody>(request);
  if (!body?.token || !body.password || body.password.length < 12) return response.status(400).json({ message: 'A valid invitation and 12-character password are required.' });
  const url = getSupabaseServerUrl();
  if (!url) return response.status(503).json({ message: 'Staff authentication is not configured.' });
  const tokenHash = hashAccessToken(body.token);
  const lookup = await fetch(`${url}/rest/v1/rapidlink_staff_invitations_v2?token_hash=eq.${encodeURIComponent(tokenHash)}&accepted_at=is.null&revoked_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=*&limit=1`, { headers: serviceRequestHeaders(), cache: 'no-store' });
  const invitation = lookup.ok ? (await lookup.json() as InvitationRow[])[0] : undefined;
  if (!invitation) return response.status(410).json({ message: 'This invitation is invalid, expired, revoked or already used.' });
  const claimed = await fetch(`${url}/rest/v1/rapidlink_staff_invitations_v2?id=eq.${invitation.id}&accepted_at=is.null&revoked_at=is.null`, {
    method: 'PATCH', headers: serviceRequestHeaders({ 'content-type': 'application/json', prefer: 'return=representation' }), body: JSON.stringify({ accepted_at: new Date().toISOString() }),
  });
  if (!claimed.ok || !(await claimed.json() as unknown[]).length) return response.status(409).json({ message: 'This invitation has already been used.' });
  const releaseClaim = () => fetch(`${url}/rest/v1/rapidlink_staff_invitations_v2?id=eq.${invitation.id}`, { method: 'PATCH', headers: serviceRequestHeaders({ 'content-type': 'application/json' }), body: JSON.stringify({ accepted_at: null }) });
  const created = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: serviceRequestHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ email: invitation.email, password: body.password, email_confirm: true, app_metadata: { rapidlink_role: 'staff' } }),
  });
  if (!created.ok) {
    await releaseClaim();
    return response.status(400).json({ message: 'The staff account could not be activated. The email may already be registered.' });
  }
  const user = await created.json() as { id: string };
  const accountResponse = await fetch(`${url}/rest/v1/rapidlink_staff_accounts`, {
    method: 'POST',
    headers: serviceRequestHeaders({ 'content-type': 'application/json', prefer: 'return=representation' }),
    body: JSON.stringify({ organisation_id: invitation.organisation_id, auth_user_id: user.id, role: invitation.role, station_service_id: invitation.station_service_id, email: invitation.email }),
  });
  const account = accountResponse.ok ? (await accountResponse.json() as Array<{ id: string }>)[0] : undefined;
  if (!account) {
    await fetch(`${url}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: serviceRequestHeaders() });
    await releaseClaim();
    return response.status(502).json({ message: 'Staff access could not be attached. No account was retained.' });
  }
  if (invitation.role === 'responder') {
    const responder = await fetch(`${url}/rest/v1/rapidlink_responders`, {
      method: 'POST',
      headers: serviceRequestHeaders({ 'content-type': 'application/json', prefer: 'return=representation' }),
      body: JSON.stringify({
        staff_account_id: account.id,
        station_service_id: invitation.station_service_id,
        employee_number: invitation.employee_number,
        name: invitation.responder_name,
        surname: invitation.responder_surname,
        phone: invitation.responder_phone,
      }),
    });
    if (!responder.ok) {
      await fetch(`${url}/rest/v1/rapidlink_staff_accounts?id=eq.${account.id}`, { method: 'DELETE', headers: serviceRequestHeaders() });
      await fetch(`${url}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: serviceRequestHeaders() });
      await releaseClaim();
      return response.status(409).json({ message: 'The employee number already exists at this station/service. No account was retained.' });
    }
  }
  await fetch(`${url}/rest/v1/rapidlink_staff_audit_events`, {
    method: 'POST', headers: serviceRequestHeaders({ 'content-type': 'application/json' }), body: JSON.stringify({ organisation_id: invitation.organisation_id, actor_staff_account_id: account.id, event_type: 'staff_invitation_accepted', target_type: invitation.role, target_id: account.id, details: { invitationId: invitation.id } }),
  });
  return response.status(201).json({ message: `${invitation.role[0].toUpperCase()}${invitation.role.slice(1)} account activated.`, email: invitation.email, role: invitation.role });
}
