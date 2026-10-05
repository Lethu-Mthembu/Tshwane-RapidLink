import type { EmergencyAction, EmergencyState, SessionRecord } from '../features/emergency/types.js';

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

export async function getSession(code: string): Promise<SessionRecord | null> {
  if (!supabaseConfigured) return null;
  const activeAfter = encodeURIComponent(new Date().toISOString());
  const response = await fetch(`${url}/rest/v1/rapidlink_sessions?code=eq.${encodeURIComponent(code)}&expires_at=gt.${activeAfter}&select=*`, {
    headers: headers(), cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Session lookup failed: ${response.status}`);
  const rows = await response.json() as SessionRow[];
  return rows[0] ? toRecord(rows[0]) : null;
}

export async function purgeExpiredSessions() {
  if (!supabaseConfigured) return;
  await fetch(`${url}/rest/v1/rapidlink_sessions?expires_at=lt.${encodeURIComponent(new Date().toISOString())}`, {
    method: 'DELETE', headers: headers(), cache: 'no-store',
  });
}

export async function upsertSession(code: string, state: EmergencyState): Promise<SessionRecord> {
  if (!supabaseConfigured) throw new Error('Supabase is not configured');
  const timestamp = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  const response = await fetch(`${url}/rest/v1/rapidlink_sessions?on_conflict=code`, {
    method: 'POST',
    headers: headers({ 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify({ code, state, version: 0, updated_at: timestamp, expires_at: expiresAt }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Session creation failed: ${response.status}`);
  return toRecord((await response.json() as SessionRow[])[0]);
}

export async function compareAndSwapSession(record: SessionRecord, state: EmergencyState): Promise<SessionRecord | null> {
  if (!supabaseConfigured) return null;
  const response = await fetch(`${url}/rest/v1/rapidlink_sessions?code=eq.${encodeURIComponent(record.code)}&version=eq.${record.version}`, {
    method: 'PATCH',
    headers: headers({ 'content-type': 'application/json', prefer: 'return=representation' }),
    body: JSON.stringify({ state, version: record.version + 1, updated_at: new Date().toISOString() }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Session update failed: ${response.status}`);
  const rows = await response.json() as SessionRow[];
  return rows[0] ? toRecord(rows[0]) : null;
}

export async function commitSessionAction(record: SessionRecord, state: EmergencyState, event: EmergencyAction): Promise<SessionRecord | null> {
  if (!supabaseConfigured) return null;
  const response = await fetch(`${url}/rest/v1/rpc/rapidlink_commit_session_action`, {
    method: 'POST',
    headers: headers({ 'content-type': 'application/json' }),
    body: JSON.stringify({
      p_code: record.code,
      p_expected_version: record.version,
      p_state: state,
      p_action_id: event.id,
      p_action_type: event.type,
      p_action_payload: event.payload,
    }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Session action commit failed: ${response.status}`);
  const rows = await response.json() as SessionRow[];
  return rows[0] ? toRecord(rows[0]) : null;
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
  return (await sessionResponse.json() as SessionRow[]).map(toRecord);
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
