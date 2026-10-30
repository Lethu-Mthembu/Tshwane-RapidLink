import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import type { EmergencyAction, EmergencyState, StaffIdentity, StaffRole } from '../features/emergency/types.js';
import type { ApiRequest } from './vercel-api.js';

const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)?.replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

const serviceHeaders = (extra: HeadersInit = {}) => ({
  apikey: serviceKey ?? '',
  authorization: `Bearer ${serviceKey ?? ''}`,
  ...extra,
});

export const newClientAccessToken = () => randomBytes(32).toString('base64url');
export const hashAccessToken = (token: string) => createHash('sha256').update(token).digest('hex');

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function bearerToken(request: ApiRequest) {
  const value = headerValue(request.headers.authorization);
  return value?.startsWith('Bearer ') ? value.slice(7).trim() : null;
}

export function clientAccessToken(request: ApiRequest) {
  return headerValue(request.headers['x-rapidlink-client-token']);
}

export async function verifyClientAccess(sessionId: string, token: string | null | undefined) {
  if (!supabaseUrl || !serviceKey || !token) return false;
  const response = await fetch(`${supabaseUrl}/rest/v1/rapidlink_sessions?id=eq.${encodeURIComponent(sessionId)}&select=client_token_hash`, {
    headers: serviceHeaders(), cache: 'no-store',
  });
  if (!response.ok) return false;
  const row = (await response.json() as Array<{ client_token_hash: string | null }>)[0];
  if (!row?.client_token_hash) return false;
  const expected = Buffer.from(row.client_token_hash, 'hex');
  const actual = Buffer.from(hashAccessToken(token), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

interface AuthUserResponse { id: string; email?: string }

export async function authenticatedUser(request: ApiRequest): Promise<AuthUserResponse | null> {
  if (!supabaseUrl || !serviceKey) return null;
  const token = bearerToken(request);
  if (!token) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceKey, authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  return response.ok ? await response.json() as AuthUserResponse : null;
}

interface StaffRow {
  id: string;
  organisation_id: string;
  auth_user_id: string;
  role: StaffRole;
  station_service_id: string | null;
  email: string;
}

interface StationScopeRow { id: string; station_key: string; name: string; service: 'police' | 'ambulance' | 'fire' }
interface ResponderRow { id: string }

export async function staffIdentity(request: ApiRequest): Promise<StaffIdentity | null> {
  if (!supabaseUrl || !serviceKey) return null;
  const user = await authenticatedUser(request);
  if (!user) return null;
  const query = new URLSearchParams({
    auth_user_id: `eq.${user.id}`,
    active: 'eq.true',
    select: 'id,organisation_id,auth_user_id,role,station_service_id,email',
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/rapidlink_staff_accounts?${query}`, {
    headers: serviceHeaders(), cache: 'no-store',
  });
  if (!response.ok) return null;
  const row = (await response.json() as StaffRow[])[0];
  if (!row) return null;
  let scope: StationScopeRow | undefined;
  if (row.station_service_id) {
    const scopeResponse = await fetch(`${supabaseUrl}/rest/v1/rapidlink_service_stations?id=eq.${row.station_service_id}&select=id,station_key,name,service`, { headers: serviceHeaders(), cache: 'no-store' });
    if (!scopeResponse.ok) return null;
    scope = (await scopeResponse.json() as StationScopeRow[])[0];
    if (!scope) return null;
  }
  let responder: ResponderRow | undefined;
  if (row.role === 'responder') {
    const responderResponse = await fetch(`${supabaseUrl}/rest/v1/rapidlink_responders?staff_account_id=eq.${row.id}&active=eq.true&select=id`, { headers: serviceHeaders(), cache: 'no-store' });
    if (!responderResponse.ok) return null;
    responder = (await responderResponse.json() as ResponderRow[])[0];
    if (!responder) return null;
  }
  return {
    userId: row.auth_user_id,
    staffAccountId: row.id,
    organisationId: row.organisation_id,
    role: row.role,
    stationServiceId: scope?.id,
    stationId: scope?.station_key,
    stationName: scope?.name,
    service: scope?.service,
    employeeId: responder?.id,
    email: row.email,
  };
}

const clientActions = new Set<EmergencyAction['type']>([
  'create-incident', 'submit-incident', 'update-location', 'add-information', 'update-profile', 'confirm-help-received',
]);
const responderActions = new Set<EmergencyAction['type']>([
  'decline-offer', 'accept-offer', 'update-progress', 'respond-cancellation', 'request-completion',
  'complete-handover', 'set-responder-availability', 'responder-heartbeat', 'mark-notification-delivered', 'mark-notification-read',
]);

function responderOwnsAction(state: EmergencyState, identity: StaffIdentity, action: EmergencyAction) {
  const employeeId = identity.employeeId;
  if (!employeeId) return false;
  const payload = action.payload as Record<string, unknown>;
  if (typeof payload.employeeId === 'string' && payload.employeeId !== employeeId) return false;
  if (typeof payload.offerId === 'string') return state.offers.some((offer) => offer.id === payload.offerId && offer.employeeId === employeeId);
  if (typeof payload.messageId === 'string') return state.messages.some((message) => message.id === payload.messageId && message.employeeId === employeeId);
  return true;
}

export async function authorizeAction(request: ApiRequest, sessionId: string, sessionCode: string, state: EmergencyState, action: EmergencyAction) {
  if (action.type === 'save-profile' && !state.profile && await verifyClientAccess(sessionId, clientAccessToken(request))) return { kind: 'client' as const };
  if (clientActions.has(action.type) && await verifyClientAccess(sessionId, clientAccessToken(request))) return { kind: 'client' as const };
  const identity = await staffIdentity(request);
  if (!identity) return null;
  if (identity.role === 'responder' && responderActions.has(action.type) && responderOwnsAction(state, identity, action)) return { kind: 'staff' as const, identity };
  return null;
}

export function redactStateForStaff(state: EmergencyState, identity: StaffIdentity): EmergencyState {
  const employeeId = identity.employeeId;
  const visibleOffers = state.offers.filter((offer) => offer.employeeId === employeeId);
  const visibleIncidentIds = new Set(visibleOffers.map((offer) => offer.incidentId));
  const assignedIncidentIds = new Set(state.incidents.filter((incident) => incident.assignedEmployeeId === employeeId).map((incident) => incident.id));
  const incidents = state.incidents
    .filter((incident) => visibleIncidentIds.has(incident.id) || assignedIncidentIds.has(incident.id))
    .map((incident) => assignedIncidentIds.has(incident.id) ? incident : { ...incident, information: [] });
  return {
    ...state,
    accessScope: 'staff',
    profile: assignedIncidentIds.size > 0 ? state.profile : null,
    profileSecurity: null,
    employees: state.employees.filter((employee) => employee.id === employeeId),
    attendance: state.attendance.filter((entry) => entry.employeeId === employeeId),
    incidents,
    offers: visibleOffers,
    messages: state.messages.filter((message) => message.employeeId === employeeId),
    audit: [],
    registrationStatus: state.profile ? 'REGISTERED' : 'NOT_REGISTERED',
  };
}

export function serviceRequestHeaders(extra: HeadersInit = {}) {
  return serviceHeaders(extra);
}

export function getSupabaseServerUrl() {
  return supabaseUrl;
}

export async function claimResponderAssignment(identity: StaffIdentity, sessionId: string, incidentId: string) {
  if (!supabaseUrl || !serviceKey || identity.role !== 'responder' || !identity.employeeId) return false;
  const response = await fetch(`${supabaseUrl}/rest/v1/rapidlink_responders?id=eq.${identity.employeeId}&active=eq.true&availability=eq.available&dispatch_status=eq.available`, {
    method: 'PATCH',
    headers: serviceHeaders({ 'content-type': 'application/json', prefer: 'return=representation' }),
    body: JSON.stringify({ dispatch_status: 'responding', current_session_id: sessionId, current_incident_key: incidentId, updated_at: new Date().toISOString() }),
  });
  return response.ok && (await response.json() as unknown[]).length === 1;
}

export async function releaseResponderAssignment(employeeId: string, sessionId: string, incidentId: string) {
  if (!supabaseUrl || !serviceKey) return;
  await fetch(`${supabaseUrl}/rest/v1/rapidlink_responders?id=eq.${employeeId}&current_session_id=eq.${sessionId}&current_incident_key=eq.${encodeURIComponent(incidentId)}`, {
    method: 'PATCH',
    headers: serviceHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ dispatch_status: 'available', current_session_id: null, current_incident_key: null, updated_at: new Date().toISOString() }),
  });
}

export async function persistResponderOperationalAction(identity: StaffIdentity, action: EmergencyAction) {
  if (!supabaseUrl || !serviceKey || identity.role !== 'responder' || !identity.employeeId) return;
  if (action.type === 'set-responder-availability') {
    await fetch(`${supabaseUrl}/rest/v1/rapidlink_responders?id=eq.${identity.employeeId}`, {
      method: 'PATCH', headers: serviceHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ availability: action.payload.availability, availability_reason: action.payload.reason?.trim() || null, availability_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    });
  }
  if (action.type === 'responder-heartbeat') {
    await fetch(`${supabaseUrl}/rest/v1/rapidlink_responders?id=eq.${identity.employeeId}`, {
      method: 'PATCH', headers: serviceHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ last_heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    });
  }
}
