import webpush from 'web-push';

import { getSupabaseServerUrl, serviceRequestHeaders } from './auth-server.js';

const publicKey = process.env.VAPID_PUBLIC_KEY ?? process.env.VITE_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT ?? 'mailto:rapidlink@example.invalid';

export const webPushConfigured = Boolean(publicKey && privateKey);
if (publicKey && privateKey) webpush.setVapidDetails(subject, publicKey, privateKey);

interface OutboxRow {
  session_id: string;
  message_key: string;
  offer_key: string;
  incident_key: string;
  employee_key: string;
  message_body: string;
  attempts: number;
}

interface MemberRow { id: string; employee_key: string }
interface SubscriptionRow { id: string; endpoint: string; p256dh: string; auth_secret: string; failure_count: number }

export async function dispatchQueuedPushNotifications(sessionId: string, sessionCode: string) {
  const url = getSupabaseServerUrl();
  if (!url || !webPushConfigured) return { submitted: 0, failed: 0, unregistered: 0, results: [] as Array<{ messageId: string; status: 'submitted' | 'failed' | 'no_subscription' }> };
  const queuedResponse = await fetch(`${url}/rest/v1/rapidlink_notification_outbox?session_id=eq.${sessionId}&channel=eq.in_app&delivery_status=in.(queued,failed,no_subscription)&attempts=lt.3&select=session_id,message_key,offer_key,incident_key,employee_key,message_body,attempts`, { headers: serviceRequestHeaders(), cache: 'no-store' });
  if (!queuedResponse.ok) throw new Error(`Push outbox lookup failed: ${queuedResponse.status}`);
  const queued = await queuedResponse.json() as OutboxRow[];
  let submitted = 0; let failed = 0; let unregistered = 0;
  const results: Array<{ messageId: string; status: 'submitted' | 'failed' | 'no_subscription' }> = [];
  for (const message of queued) {
    const memberResponse = await fetch(`${url}/rest/v1/rapidlink_staff_members?session_id=eq.${sessionId}&employee_key=eq.${encodeURIComponent(message.employee_key)}&active=eq.true&select=id,employee_key&limit=1`, { headers: serviceRequestHeaders(), cache: 'no-store' });
    const member = memberResponse.ok ? (await memberResponse.json() as MemberRow[])[0] : null;
    const subscriptionResponse = member ? await fetch(`${url}/rest/v1/rapidlink_push_subscriptions?staff_member_id=eq.${member.id}&disabled_at=is.null&select=id,endpoint,p256dh,auth_secret,failure_count`, { headers: serviceRequestHeaders(), cache: 'no-store' }) : null;
    const subscriptions = subscriptionResponse?.ok ? await subscriptionResponse.json() as SubscriptionRow[] : [];
    if (!subscriptions.length) {
      unregistered += 1;
      results.push({ messageId: message.message_key, status: 'no_subscription' });
      await updateOutbox(message, 'no_subscription', 'No active device notification subscription.');
      continue;
    }
    let deliveredToPushService = false;
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_secret } }, JSON.stringify({
          title: 'RapidLink emergency request',
          body: 'A new emergency request requires your response.',
          url: `/responder/offers/${message.offer_key}?session=${encodeURIComponent(sessionCode)}`,
          tag: message.offer_key,
        }), { TTL: 120, urgency: 'high' });
        deliveredToPushService = true;
        await fetch(`${url}/rest/v1/rapidlink_push_subscriptions?id=eq.${subscription.id}`, { method: 'PATCH', headers: serviceRequestHeaders({ 'content-type': 'application/json' }), body: JSON.stringify({ failure_count: 0, last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
      } catch (error) {
        const statusCode = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 0;
        const disabled = statusCode === 404 || statusCode === 410;
        await fetch(`${url}/rest/v1/rapidlink_push_subscriptions?id=eq.${subscription.id}`, { method: 'PATCH', headers: serviceRequestHeaders({ 'content-type': 'application/json' }), body: JSON.stringify({ failure_count: subscription.failure_count + 1, updated_at: new Date().toISOString(), ...(disabled ? { disabled_at: new Date().toISOString() } : {}) }) });
      }
    }
    if (deliveredToPushService) { submitted += 1; results.push({ messageId: message.message_key, status: 'submitted' }); await updateOutbox(message, 'submitted'); }
    else { failed += 1; results.push({ messageId: message.message_key, status: 'failed' }); await updateOutbox(message, 'failed', 'Every registered push endpoint rejected the notification.'); }
  }
  return { submitted, failed, unregistered, results };
}

async function updateOutbox(message: OutboxRow, status: 'submitted' | 'failed' | 'no_subscription', error?: string) {
  const url = getSupabaseServerUrl();
  if (!url) return;
  const timestamp = new Date().toISOString();
  await fetch(`${url}/rest/v1/rapidlink_notification_outbox?session_id=eq.${message.session_id}&message_key=eq.${encodeURIComponent(message.message_key)}`, {
    method: 'PATCH',
    headers: serviceRequestHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ delivery_status: status, provider: 'web_push', attempts: message.attempts + 1, submitted_at: status === 'submitted' ? timestamp : null, failed_at: status === 'submitted' ? null : timestamp, last_error: error ?? null }),
  });
}
