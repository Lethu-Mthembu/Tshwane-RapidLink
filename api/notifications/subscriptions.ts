import { applyEmergencyAction, normalizeEmergencyState, normalizeRoomCode } from '../../src/features/emergency/session-service.js';
import type { EmergencyAction } from '../../src/features/emergency/types.js';
import { getSupabaseServerUrl, serviceRequestHeaders, staffIdentity } from '../../src/lib/auth-server.js';
import { commitSessionAction, getSession } from '../../src/lib/supabase-server.js';
import { bodyAs, methodNotAllowed, type ApiRequest, type ApiResponse } from '../../src/lib/vercel-api.js';
import { dispatchQueuedPushNotifications } from '../../src/lib/web-push-server.js';

interface SubscriptionBody { code?: string; endpoint?: string; keys?: { p256dh?: string; auth?: string } }

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!['POST', 'DELETE'].includes(request.method ?? '')) return methodNotAllowed(response, 'POST, DELETE');
  const body = bodyAs<SubscriptionBody>(request);
  const code = normalizeRoomCode(body?.code ?? '');
  const session = code ? await getSession(code) : null;
  const identity = await staffIdentity(request);
  if (identity?.role !== 'responder' || !identity.employeeId) return response.status(403).json({ message: 'Responder access is required.' });
  if (!body?.endpoint) return response.status(400).json({ message: 'A device subscription is required.' });
  const url = getSupabaseServerUrl();
  if (!url) return response.status(503).json({ message: 'Notifications are not configured.' });
  if (request.method === 'DELETE') {
    await fetch(`${url}/rest/v1/rapidlink_push_subscriptions_v2?staff_account_id=eq.${identity.staffAccountId}&endpoint=eq.${encodeURIComponent(body.endpoint)}`, { method: 'DELETE', headers: serviceRequestHeaders() });
    return response.status(204).json({});
  }
  if (!body.keys?.p256dh || !body.keys.auth) return response.status(400).json({ message: 'The device subscription is incomplete.' });
  const saved = await fetch(`${url}/rest/v1/rapidlink_push_subscriptions_v2?on_conflict=endpoint`, {
    method: 'POST',
    headers: serviceRequestHeaders({ 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ staff_account_id: identity.staffAccountId, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth_secret: body.keys.auth, user_agent: request.headers['user-agent'] ?? null, failure_count: 0, disabled_at: null, last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  });
  if (!saved.ok) return response.status(502).json({ message: 'The device subscription could not be saved.' });

  if (!session) return response.status(201).json({ message: 'Device notifications enabled.' });
  let latest = session;
  const push = await dispatchQueuedPushNotifications(session.id, session.code).catch(() => null);
  for (const result of push?.results ?? []) {
    const event: EmergencyAction = { id: crypto.randomUUID(), type: 'record-notification-result', payload: result };
    const committed = await commitSessionAction(latest, applyEmergencyAction(normalizeEmergencyState(latest.state), event), event);
    if (committed) latest = committed;
  }
  return response.status(201).json({ message: 'Device notifications enabled.' });
}
