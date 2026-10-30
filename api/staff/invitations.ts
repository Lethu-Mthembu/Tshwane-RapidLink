import { randomBytes } from 'node:crypto';

import { getSupabaseServerUrl, hashAccessToken, serviceRequestHeaders, staffIdentity } from '../../src/lib/auth-server.js';
import { resendConfigured, sendStaffInvitation } from '../../src/lib/resend-server.js';
import { bodyAs, methodNotAllowed, type ApiRequest, type ApiResponse } from '../../src/lib/vercel-api.js';

type InvitationRole = 'admin' | 'supervisor' | 'responder';
interface InvitationBody {
  role?: InvitationRole;
  stationServiceId?: string;
  email?: string;
  employeeNumber?: string;
  name?: string;
  surname?: string;
  phone?: string;
}
interface StationRow { id: string; name: string; service: string }

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^(?:\+27|0)[6-8][0-9]{8}$/;

export default async function handler(request: ApiRequest, response: ApiResponse) {
  const actor = await staffIdentity(request);
  if (!actor || !['admin', 'supervisor'].includes(actor.role)) return response.status(403).json({ message: 'Administrator or supervisor access is required.' });
  const url = getSupabaseServerUrl();
  if (!url) return response.status(503).json({ message: 'Staff authentication is not configured.' });

  if (request.method === 'GET') {
    const scopeFilter = actor.role === 'supervisor' ? `&station_service_id=eq.${actor.stationServiceId}&role=eq.responder` : '';
    const invitationResponse = await fetch(`${url}/rest/v1/rapidlink_staff_invitations_v2?organisation_id=eq.${actor.organisationId}${scopeFilter}&accepted_at=is.null&revoked_at=is.null&select=id,role,station_service_id,email,employee_number,responder_name,responder_surname,responder_phone,expires_at,created_at&order=created_at.desc`, { headers: serviceRequestHeaders(), cache: 'no-store' });
    if (!invitationResponse.ok) return response.status(502).json({ message: 'Invitations could not be loaded.' });
    return response.status(200).json({ invitations: await invitationResponse.json(), emailDeliveryConfigured: resendConfigured });
  }

  if (request.method === 'DELETE') {
    const id = typeof request.query.id === 'string' ? request.query.id : '';
    if (!id) return response.status(400).json({ message: 'Invitation ID is required.' });
    const scopeFilter = actor.role === 'supervisor' ? `&station_service_id=eq.${actor.stationServiceId}&role=eq.responder` : '';
    const revoked = await fetch(`${url}/rest/v1/rapidlink_staff_invitations_v2?id=eq.${encodeURIComponent(id)}&organisation_id=eq.${actor.organisationId}${scopeFilter}&accepted_at=is.null`, {
      method: 'PATCH', headers: serviceRequestHeaders({ 'content-type': 'application/json', prefer: 'return=representation' }), body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    });
    if (!revoked.ok || !(await revoked.json() as unknown[]).length) return response.status(404).json({ message: 'Active invitation not found.' });
    return response.status(200).json({ message: 'Invitation revoked.' });
  }

  if (request.method !== 'POST') return methodNotAllowed(response, 'GET, POST, DELETE');
  if (!resendConfigured) return response.status(503).json({ message: 'Email invitations are disabled until RESEND_API_KEY is configured.' });
  const body = bodyAs<InvitationBody>(request);
  const requestedRole = actor.role === 'supervisor' ? 'responder' : body?.role;
  const email = body?.email?.trim().toLowerCase() ?? '';
  if (!requestedRole || !emailPattern.test(email)) return response.status(400).json({ message: 'A valid role and work email are required.' });
  if (actor.role === 'supervisor' && requestedRole !== 'responder') return response.status(403).json({ message: 'Supervisors may only invite responders.' });
  if (actor.role === 'admin' && requestedRole === 'responder') return response.status(403).json({ message: 'Responders must be invited by a supervisor assigned to their station and service.' });
  const stationServiceId = requestedRole === 'admin' ? null : actor.role === 'supervisor' ? actor.stationServiceId : body?.stationServiceId;
  if (requestedRole !== 'admin' && !stationServiceId) return response.status(400).json({ message: 'A station and service are required.' });
  if (requestedRole === 'responder') {
    const phone = body?.phone?.replace(/[\s()-]/g, '') ?? '';
    if (!body?.employeeNumber?.trim() || !body.name?.trim() || !body.surname?.trim() || !phonePattern.test(phone)) return response.status(400).json({ message: 'Employee number, name, surname and a valid South African phone number are required.' });
  }
  let station: StationRow | undefined;
  if (stationServiceId) {
    const stationResponse = await fetch(`${url}/rest/v1/rapidlink_service_stations?id=eq.${encodeURIComponent(stationServiceId)}&organisation_id=eq.${actor.organisationId}&active=eq.true&select=id,name,service`, { headers: serviceRequestHeaders(), cache: 'no-store' });
    station = stationResponse.ok ? (await stationResponse.json() as StationRow[])[0] : undefined;
    if (!station) return response.status(400).json({ message: 'The selected station/service scope is invalid.' });
  }
  const token = randomBytes(32).toString('base64url');
  const invitationId = crypto.randomUUID();
  await fetch(`${url}/rest/v1/rapidlink_staff_invitations_v2?organisation_id=eq.${actor.organisationId}&email=eq.${encodeURIComponent(email)}&accepted_at=is.null&revoked_at=is.null&expires_at=lte.${encodeURIComponent(new Date().toISOString())}`, {
    method: 'PATCH',
    headers: serviceRequestHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ revoked_at: new Date().toISOString() }),
  });
  const invitation = await fetch(`${url}/rest/v1/rapidlink_staff_invitations_v2`, {
    method: 'POST',
    headers: serviceRequestHeaders({ 'content-type': 'application/json', prefer: 'return=minimal' }),
    body: JSON.stringify({
      id: invitationId,
      organisation_id: actor.organisationId,
      role: requestedRole,
      station_service_id: stationServiceId,
      email,
      employee_number: requestedRole === 'responder' ? body?.employeeNumber?.trim() : null,
      responder_name: requestedRole === 'responder' ? body?.name?.trim() : null,
      responder_surname: requestedRole === 'responder' ? body?.surname?.trim() : null,
      responder_phone: requestedRole === 'responder' ? body?.phone?.replace(/[\s()-]/g, '') : null,
      token_hash: hashAccessToken(token),
      expires_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
      created_by: actor.staffAccountId,
    }),
  });
  if (!invitation.ok) return response.status(409).json({ message: 'An active invitation or staff account already uses that email or employee number.' });
  const appUrl = (process.env.RAPIDLINK_APP_URL ?? process.env.VITE_APP_URL ?? `https://${request.headers.host ?? ''}`).replace(/\/$/, '');
  const activationUrl = `${appUrl}/staff/activate?token=${encodeURIComponent(token)}`;
  try {
    await sendStaffInvitation({ to: email, role: requestedRole, activationUrl, stationName: station?.name, service: station?.service, idempotencyKey: `rapidlink-invitation/${invitationId}` });
  } catch (reason) {
    await fetch(`${url}/rest/v1/rapidlink_staff_invitations_v2?id=eq.${invitationId}`, { method: 'PATCH', headers: serviceRequestHeaders({ 'content-type': 'application/json' }), body: JSON.stringify({ revoked_at: new Date().toISOString() }) });
    return response.status(502).json({ message: reason instanceof Error ? reason.message : 'Invitation email delivery failed.' });
  }
  await fetch(`${url}/rest/v1/rapidlink_staff_audit_events`, {
    method: 'POST', headers: serviceRequestHeaders({ 'content-type': 'application/json' }), body: JSON.stringify({ organisation_id: actor.organisationId, actor_staff_account_id: actor.staffAccountId, event_type: 'staff_invited', target_type: requestedRole, target_id: invitationId, details: { email, stationServiceId } }),
  });
  return response.status(201).json({ message: 'Invitation sent.', expiresInHours: 24 });
}
