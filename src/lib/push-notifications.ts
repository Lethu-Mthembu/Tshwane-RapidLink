import { staffAuthorizationHeaders } from './staff-auth';

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export const pushNotificationsConfigured = Boolean(import.meta.env.VITE_VAPID_PUBLIC_KEY);

export async function enablePushNotifications(code: string) {
  if (!pushNotificationsConfigured) throw new Error('Device notifications are not configured for this deployment.');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('This browser does not support device notifications.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted.');
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY!),
  });
  const response = await fetch('/api/notifications/subscriptions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...await staffAuthorizationHeaders() },
    body: JSON.stringify({ code, ...subscription.toJSON() }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? 'Device notification registration failed.');
  }
  return subscription;
}
