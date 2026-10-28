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
  auth_user_id: string;
  session_id: string;
  role: StaffRole;
  station_key: string;
  employee_key: string | null;
  email: string;
}

export async function staffIdentity(request: ApiRequest, sessionId: string, sessionCode: string): Promise<StaffIdentity | null> {
  if (!supabaseUrl || !serviceKey) return null;
  const user = await authenticatedUser(request);
  if (!user) return null;
  const query = new URLSearchParams({
    auth_user_id: `eq.${user.id}`,
    session_id: `eq.${sessionId}`,
    active: 'eq.true',
    select: 'auth_user_id,session_id,role,station_key,employee_key,email',
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/rapidlink_staff_members?${query}`, {
    headers: serviceHeaders(), cache: 'no-store',
  });
  if (!response.ok) return null;
  const row = (await response.json() as StaffRow[])[0];
  return row ? {
    userId: row.auth_user_id,
    sessionId: row.session_id,
    sessionCode,
    role: row.role,
    stationId: row.station_key,
    employeeId: row.employee_key ?? undefined,
    email: row.email,
  } : null;
}

const clientActions = new Set<EmergencyAction['type']>([
  'create-incident', 'submit-incident', 'update-location', 'add-information', 'update-profile', 'confirm-help-received',
]);
const supervisorActions = new Set<EmergencyAction['type']>([
  'save-attendance', 'end-shift', 'add-employee', 'update-employee', 'supervisor-close-incident', 'reset-session',
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
  const identity = await staffIdentity(request, sessionId, sessionCode);
  if (!identity) return null;
  if (identity.role === 'supervisor' && supervisorActions.has(action.type)) return { kind: 'staff' as const, identity };
  if (identity.role === 'responder' && responderActions.has(action.type) && responderOwnsAction(state, identity, action)) return { kind: 'staff' as const, identity };
  return null;
}

export function redactStateForStaff(state: EmergencyState, identity: StaffIdentity): EmergencyState {
  const stationEmployeeIds = new Set(state.employees.filter((employee) => employee.stationId === identity.stationId).map((employee) => employee.id));
  const employeeId = identity.employeeId;
  const visibleOffers = identity.role === 'supervisor'
    ? state.offers.filter((offer) => stationEmployeeIds.has(offer.employeeId))
    : state.offers.filter((offer) => offer.employeeId === employeeId);
  const visibleIncidentIds = new Set(visibleOffers.map((offer) => offer.incidentId));
  const assignedIncidentIds = new Set(state.incidents.filter((incident) => incident.assignedEmployeeId === employeeId).map((incident) => incident.id));
  const incidents = state.incidents
    .filter((incident) => identity.role === 'supervisor' || visibleIncidentIds.has(incident.id) || assignedIncidentIds.has(incident.id))
    .map((incident) => identity.role === 'supervisor' || assignedIncidentIds.has(incident.id) ? incident : { ...incident, information: [] });
  return {
    ...state,
    accessScope: 'staff',
    profile: identity.role === 'responder' && assignedIncidentIds.size > 0 ? state.profile : null,
    profileSecurity: null,
    employees: identity.role === 'supervisor' ? state.employees.filter((employee) => employee.stationId === identity.stationId) : state.employees.filter((employee) => employee.id === employeeId),
    attendance: identity.role === 'supervisor' ? state.attendance.filter((entry) => stationEmployeeIds.has(entry.employeeId)) : state.attendance.filter((entry) => entry.employeeId === employeeId),
    incidents,
    offers: visibleOffers,
    messages: identity.role === 'supervisor' ? state.messages.filter((message) => stationEmployeeIds.has(message.employeeId)) : state.messages.filter((message) => message.employeeId === employeeId),
    audit: identity.role === 'supervisor' ? state.audit : [],
    registrationStatus: state.profile ? 'REGISTERED' : 'NOT_REGISTERED',
  };
}

export function serviceRequestHeaders(extra: HeadersInit = {}) {
  return serviceHeaders(extra);
}

export function getSupabaseServerUrl() {
  return supabaseUrl;
}
