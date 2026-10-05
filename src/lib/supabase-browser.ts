import type { EmergencyState } from '@/features/emergency/types';

export function subscribeToRoom(_code: string, _onState: (state: EmergencyState) => void) {
  // Operational tables are intentionally not exposed to the anonymous Data API.
  // EmergencyProvider polls the protected server endpoint; authenticated realtime
  // can be added when client, responder and supervisor identities are introduced.
  return () => undefined;
}
