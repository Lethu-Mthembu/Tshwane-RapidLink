import { getSupabaseServerUrl, serviceRequestHeaders, staffIdentity } from '../../src/lib/auth-server.js';
import { methodNotAllowed, type ApiRequest, type ApiResponse } from '../../src/lib/vercel-api.js';

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'GET') return methodNotAllowed(response, 'GET');
  const actor = await staffIdentity(request);
  if (!actor || !['admin', 'supervisor'].includes(actor.role)) return response.status(403).json({ message: 'Administrator or supervisor access is required.' });
  const url = getSupabaseServerUrl();
  if (!url) return response.status(503).json({ message: 'Staff directory is not configured.' });
  const stationFilter = actor.role === 'supervisor' ? `&id=eq.${actor.stationServiceId}` : '';
  const responderFilter = actor.role === 'supervisor' ? `station_service_id=eq.${actor.stationServiceId}&` : '';
  const accountFilter = actor.role === 'supervisor' ? `&station_service_id=eq.${actor.stationServiceId}&role=eq.responder` : '';
  const [stations, accounts, responders, attendance] = await Promise.all([
    fetch(`${url}/rest/v1/rapidlink_service_stations?organisation_id=eq.${actor.organisationId}&active=eq.true${stationFilter}&select=id,station_key,name,area,latitude,longitude,service&order=name,service`, { headers: serviceRequestHeaders(), cache: 'no-store' }),
    fetch(`${url}/rest/v1/rapidlink_staff_accounts?organisation_id=eq.${actor.organisationId}${accountFilter}&select=id,role,station_service_id,email,active,created_at&order=created_at.desc`, { headers: serviceRequestHeaders(), cache: 'no-store' }),
    fetch(`${url}/rest/v1/rapidlink_responders?${responderFilter}select=id,staff_account_id,station_service_id,employee_number,name,surname,phone,active,availability,availability_reason,availability_updated_at,last_heartbeat_at,created_at&order=surname,name`, { headers: serviceRequestHeaders(), cache: 'no-store' }),
    actor.role === 'supervisor'
      ? fetch(`${url}/rest/v1/rapidlink_responder_attendance?select=id,responder_id,duty_date,shift_start,shift_end,choice,ended_at,updated_at&order=updated_at.desc&limit=200`, { headers: serviceRequestHeaders(), cache: 'no-store' })
      : Promise.resolve(null),
  ]);
  if (!stations.ok || !accounts.ok || !responders.ok || (attendance && !attendance.ok)) return response.status(502).json({ message: 'Staff directory could not be loaded.' });
  const responderRows = await responders.json() as Array<Record<string, unknown>>;
  const responderIds = new Set(responderRows.map((item) => String(item.id)));
  const attendanceRows = attendance ? (await attendance.json() as Array<Record<string, unknown>>).filter((entry) => responderIds.has(String(entry.responder_id))) : [];
  return response.status(200).json({
    stations: await stations.json(),
    accounts: await accounts.json(),
    responders: responderRows,
    attendance: attendanceRows,
  });
}
