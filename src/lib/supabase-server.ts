import type { AttendanceEntry, EmergencyAction, EmergencyState, Employee, SessionRecord, Station } from '../features/emergency/types.js';

interface SessionRow {
  id: string;
  code: string;
  state: EmergencyState;
  version: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)?.replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseConfigured = Boolean(url && serviceKey);

const headers = (extra: HeadersInit = {}) => ({
  apikey: serviceKey ?? '',
  authorization: `Bearer ${serviceKey ?? ''}`,
  ...extra,
});

const toRecord = (row: SessionRow): SessionRecord => ({
  id: row.id,
  code: row.code,
  state: row.state,
  version: row.version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  expiresAt: row.expires_at,
});

interface ServiceStationRow { id: string; station_key: string; name: string; area: string; latitude: number; longitude: number; service: 'police' | 'ambulance' | 'fire' }
interface ResponderRow { id: string; staff_account_id: string; station_service_id: string; employee_number: string; name: string; surname: string; phone: string; active: boolean; availability: Employee['availability']; availability_reason?: string; availability_updated_at?: string; last_heartbeat_at?: string; dispatch_status: 'available' | 'responding' }
interface StaffAccountRow { id: string; email: string }
interface AttendanceRow { id: string; responder_id: string; duty_date: string; shift_start: string; shift_end: string; choice: AttendanceEntry['choice']; ended_at?: string; updated_at: string; updated_by: string }

function stripOperationalDirectory(state: EmergencyState): EmergencyState {
  return { ...state, employees: [], attendance: [] };
}

async function hydrateOperationalDirectory(record: SessionRecord): Promise<SessionRecord> {
  if (!supabaseConfigured) return record;
  const [stationResponse, responderResponse, accountResponse, attendanceResponse] = await Promise.all([
    fetch(`${url}/rest/v1/rapidlink_service_stations?active=eq.true&select=id,station_key,name,area,latitude,longitude,service`, { headers: headers(), cache: 'no-store' }),
    fetch(`${url}/rest/v1/rapidlink_responders?active=eq.true&select=id,staff_account_id,station_service_id,employee_number,name,surname,phone,active,availability,availability_reason,availability_updated_at,last_heartbeat_at,dispatch_status`, { headers: headers(), cache: 'no-store' }),
    fetch(`${url}/rest/v1/rapidlink_staff_accounts?active=eq.true&role=eq.responder&select=id,email`, { headers: headers(), cache: 'no-store' }),
    fetch(`${url}/rest/v1/rapidlink_responder_attendance?select=id,responder_id,duty_date,shift_start,shift_end,choice,ended_at,updated_at,updated_by`, { headers: headers(), cache: 'no-store' }),
  ]);
  if (!stationResponse.ok || !responderResponse.ok || !accountResponse.ok || !attendanceResponse.ok) throw new Error('Permanent responder directory lookup failed.');
  const stationRows = await stationResponse.json() as ServiceStationRow[];
  const responderRows = await responderResponse.json() as ResponderRow[];
  const accountRows = await accountResponse.json() as StaffAccountRow[];
  const attendanceRows = await attendanceResponse.json() as AttendanceRow[];
  const scopes = new Map(stationRows.map((station) => [station.id, station]));
  const emails = new Map(accountRows.map((account) => [account.id, account.email]));
  const stationGroups = new Map<string, Station>();
  for (const row of stationRows) {
    const existing = stationGroups.get(row.station_key);
    if (existing) existing.services.push(row.service);
    else stationGroups.set(row.station_key, { id: row.station_key, name: row.name, area: row.area, latitude: row.latitude, longitude: row.longitude, services: [row.service] });
  }
  const employees: Employee[] = responderRows.flatMap((responder) => {
    const scope = scopes.get(responder.station_service_id);
    if (!scope) return [];
    return [{
      id: responder.id,
      employeeNumber: responder.employee_number,
      name: responder.name,
      surname: responder.surname,
      phone: responder.phone,
      service: scope.service,
      stationId: scope.station_key,
      active: responder.active,
      workEmail: emails.get(responder.staff_account_id),
      accessEnabled: true,
      availability: responder.dispatch_status === 'responding' ? 'temporarily_unavailable' : responder.availability,
      availabilityReason: responder.dispatch_status === 'responding' ? 'Assigned to an active response' : responder.availability_reason,
      availabilityUpdatedAt: responder.availability_updated_at,
      lastHeartbeatAt: responder.last_heartbeat_at,
    }];
  });
  const responderIds = new Set(employees.map((employee) => employee.id));
  const attendance: AttendanceEntry[] = attendanceRows.filter((entry) => responderIds.has(entry.responder_id)).map((entry) => ({
    id: entry.id, employeeId: entry.responder_id, date: entry.duty_date, shiftStart: entry.shift_start, shiftEnd: entry.shift_end,
    choice: entry.choice, endedAt: entry.ended_at, updatedAt: entry.updated_at, updatedBy: entry.updated_by,
  }));
  return { ...record, state: { ...record.state, stations: [...stationGroups.values()], employees, attendance } };
}

export async function getSession(code: string): Promise<SessionRecord | null> {
  if (!supabaseConfigured) return null;
  const activeAfter = encodeURIComponent(new Date().toISOString());
  const response = await fetch(`${url}/rest/v1/rapidlink_sessions?code=eq.${encodeURIComponent(code)}&expires_at=gt.${activeAfter}&select=*`, {
    headers: headers(), cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Session lookup failed: ${response.status}`);
  const rows = await response.json() as SessionRow[];
  return rows[0] ? hydrateOperationalDirectory(toRecord(rows[0])) : null;
}

export async function purgeExpiredSessions() {
  if (!supabaseConfigured) return;
  await fetch(`${url}/rest/v1/rapidlink_sessions?expires_at=lt.${encodeURIComponent(new Date().toISOString())}`, {
    method: 'DELETE', headers: headers(), cache: 'no-store',
  });
}

export async function upsertSession(code: string, state: EmergencyState, clientTokenHash?: string): Promise<SessionRecord> {
  if (!supabaseConfigured) throw new Error('Supabase is not configured');
  const timestamp = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  const response = await fetch(`${url}/rest/v1/rapidlink_sessions`, {
    method: 'POST',
    headers: headers({ 'content-type': 'application/json', prefer: 'return=representation' }),
    body: JSON.stringify({
      code,
      state: stripOperationalDirectory(state),
      version: 0,
      updated_at: timestamp,
      expires_at: expiresAt,
      ...(clientTokenHash ? { client_token_hash: clientTokenHash, client_token_created_at: timestamp } : {}),
    }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Session creation failed: ${response.status}`);
  return hydrateOperationalDirectory(toRecord((await response.json() as SessionRow[])[0]));
}

export async function compareAndSwapSession(record: SessionRecord, state: EmergencyState): Promise<SessionRecord | null> {
  if (!supabaseConfigured) return null;
  const response = await fetch(`${url}/rest/v1/rapidlink_sessions?code=eq.${encodeURIComponent(record.code)}&version=eq.${record.version}`, {
    method: 'PATCH',
    headers: headers({ 'content-type': 'application/json', prefer: 'return=representation' }),
    body: JSON.stringify({ state: stripOperationalDirectory(state), version: record.version + 1, updated_at: new Date().toISOString() }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Session update failed: ${response.status}`);
  const rows = await response.json() as SessionRow[];
  return rows[0] ? hydrateOperationalDirectory(toRecord(rows[0])) : null;
}

export async function commitSessionAction(record: SessionRecord, state: EmergencyState, event: EmergencyAction): Promise<SessionRecord | null> {
  if (!supabaseConfigured) return null;
  const response = await fetch(`${url}/rest/v1/rpc/rapidlink_commit_session_action`, {
    method: 'POST',
    headers: headers({ 'content-type': 'application/json' }),
    body: JSON.stringify({
      p_code: record.code,
      p_expected_version: record.version,
      p_state: stripOperationalDirectory(state),
      p_action_id: event.id,
      p_action_type: event.type,
      p_action_payload: event.payload,
    }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Session action commit failed: ${response.status}`);
  const rows = await response.json() as SessionRow[];
  return rows[0] ? hydrateOperationalDirectory(toRecord(rows[0])) : null;
}

export async function listDueSessions(at = new Date()): Promise<SessionRecord[]> {
  if (!supabaseConfigured) return [];
  const due = encodeURIComponent(at.toISOString());
  const incidentResponse = await fetch(
    `${url}/rest/v1/rapidlink_incidents?status=eq.WAITING_FOR_RESPONDER&next_escalation_at=lte.${due}&select=session_id`,
    { headers: headers(), cache: 'no-store' },
  );
  if (!incidentResponse.ok) throw new Error(`Due incident lookup failed: ${incidentResponse.status}`);
  const incidentRows = await incidentResponse.json() as Array<{ session_id: string }>;
  const sessionIds = [...new Set(incidentRows.map((row) => row.session_id))];
  if (!sessionIds.length) return [];
  const idFilter = encodeURIComponent(`(${sessionIds.join(',')})`);
  const sessionResponse = await fetch(
    `${url}/rest/v1/rapidlink_sessions?id=in.${idFilter}&expires_at=gt.${due}&select=*`,
    { headers: headers(), cache: 'no-store' },
  );
  if (!sessionResponse.ok) throw new Error(`Due session lookup failed: ${sessionResponse.status}`);
  return Promise.all((await sessionResponse.json() as SessionRow[]).map((row) => hydrateOperationalDirectory(toRecord(row))));
}

export async function listNotificationSessions(at = new Date()): Promise<SessionRecord[]> {
  if (!supabaseConfigured) return [];
  const outboxResponse = await fetch(
    `${url}/rest/v1/rapidlink_notification_outbox?delivery_status=in.(queued,failed,no_subscription)&attempts=lt.3&select=session_id`,
    { headers: headers(), cache: 'no-store' },
  );
  if (!outboxResponse.ok) throw new Error(`Notification session lookup failed: ${outboxResponse.status}`);
  const rows = await outboxResponse.json() as Array<{ session_id: string }>;
  const sessionIds = [...new Set(rows.map((row) => row.session_id))];
  if (!sessionIds.length) return [];
  const filter = encodeURIComponent(`(${sessionIds.join(',')})`);
  const sessionResponse = await fetch(`${url}/rest/v1/rapidlink_sessions?id=in.${filter}&expires_at=gt.${encodeURIComponent(at.toISOString())}&select=*`, { headers: headers(), cache: 'no-store' });
  if (!sessionResponse.ok) throw new Error(`Notification session load failed: ${sessionResponse.status}`);
  return Promise.all((await sessionResponse.json() as SessionRow[]).map((row) => hydrateOperationalDirectory(toRecord(row))));
}

export async function uploadAttachment(code: string, file: { name: string; type: string; bytes: Uint8Array }) {
  if (!supabaseConfigured) throw new Error('Supabase is not configured');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
  const path = `${code}/${crypto.randomUUID()}-${safeName}`;
  const payload = new Uint8Array(file.bytes.byteLength);
  payload.set(file.bytes);
  const upload = await fetch(`${url}/storage/v1/object/rapidlink-media/${path}`, {
    method: 'POST', headers: headers({ 'content-type': file.type, 'x-upsert': 'false' }), body: new Blob([payload.buffer], { type: file.type }),
  });
  if (!upload.ok) throw new Error(`Attachment upload failed: ${upload.status}`);
  const signed = await fetch(`${url}/storage/v1/object/sign/rapidlink-media/${path}`, {
    method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify({ expiresIn: 86_400 }),
  });
  if (!signed.ok) throw new Error(`Attachment signing failed: ${signed.status}`);
  const result = await signed.json() as { signedURL?: string; signedUrl?: string };
  const signedPath = result.signedURL ?? result.signedUrl;
  return { storagePath: path, url: signedPath?.startsWith('http') ? signedPath : `${url}/storage/v1${signedPath}` };
}
