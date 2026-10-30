import { getSupabaseServerUrl, serviceRequestHeaders, staffIdentity } from '../../src/lib/auth-server.js';
import { bodyAs, methodNotAllowed, type ApiRequest, type ApiResponse } from '../../src/lib/vercel-api.js';

interface AttendanceBody { responderId?: string; date?: string; shiftStart?: string; shiftEnd?: string; choice?: 'present' | 'absent' | 'leave' }

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
  const supervisor = await staffIdentity(request);
  if (supervisor?.role !== 'supervisor' || !supervisor.stationServiceId) return response.status(403).json({ message: 'Supervisor access is required.' });
  const body = bodyAs<AttendanceBody>(request);
  if (!body?.responderId || !body.date || !body.shiftStart || !body.shiftEnd || !body.choice) return response.status(400).json({ message: 'Responder, date, shift and attendance choice are required.' });
  if (Date.parse(body.shiftEnd) <= Date.parse(body.shiftStart)) return response.status(400).json({ message: 'Shift end must be after shift start.' });
  const url = getSupabaseServerUrl();
  if (!url) return response.status(503).json({ message: 'Staff directory is not configured.' });
  const responderLookup = await fetch(`${url}/rest/v1/rapidlink_responders?id=eq.${body.responderId}&station_service_id=eq.${supervisor.stationServiceId}&active=eq.true&select=id&limit=1`, { headers: serviceRequestHeaders(), cache: 'no-store' });
  if (!responderLookup.ok || !(await responderLookup.json() as unknown[]).length) return response.status(404).json({ message: 'Responder not found in your station/service.' });
  const saved = await fetch(`${url}/rest/v1/rapidlink_responder_attendance?on_conflict=responder_id,duty_date`, {
    method: 'POST',
    headers: serviceRequestHeaders({ 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify({ responder_id: body.responderId, duty_date: body.date, shift_start: body.shiftStart, shift_end: body.shiftEnd, choice: body.choice, ended_at: body.choice === 'present' ? null : new Date().toISOString(), updated_by: supervisor.staffAccountId, updated_at: new Date().toISOString() }),
  });
  if (!saved.ok) return response.status(502).json({ message: 'Attendance could not be saved.' });
  return response.status(200).json({ attendance: (await saved.json() as unknown[])[0] });
}
