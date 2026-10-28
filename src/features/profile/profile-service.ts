import { readState, sessionService } from '@/features/emergency/session-service';
import type { CancellationPinRecord, ClientProfile } from '@/features/emergency/types';

const PIN_ITERATIONS = 210_000;

const bytesToBase64 = (bytes: Uint8Array) => {
  let value = '';
  bytes.forEach((byte) => { value += String.fromCharCode(byte); });
  return btoa(value);
};

const derivePin = async (pin: string, salt: Uint8Array, iterations: number) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const saltBuffer = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer;
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBuffer, iterations }, key, 256);
  return new Uint8Array(bits);
};

export const createPinRecord = async (pin: string): Promise<CancellationPinRecord> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derivePin(pin, salt, PIN_ITERATIONS);
  return { salt: bytesToBase64(salt), derivedHash: bytesToBase64(derived), iterations: PIN_ITERATIONS, failedAttempts: 0 };
};

export type ProfileInput = Omit<ClientProfile, 'id' | 'createdAt' | 'updatedAt'>;

export const registerProfile = async (input: ProfileInput, pin: string) => {
  const timestamp = new Date().toISOString();
  const profile: ClientProfile = { ...input, id: `client-${crypto.randomUUID()}`, createdAt: timestamp, updatedAt: timestamp };
  const security = await createPinRecord(pin);
  return sessionService.saveProfile(profile, security);
};

export const updateProfile = (input: ProfileInput) => {
  const current = readState().profile;
  if (!current) throw new Error('A registered profile is required.');
  return sessionService.updateProfile({ ...current, ...input, updatedAt: new Date().toISOString() });
};

export const changeCancellationPin = async (currentPin: string, nextPin: string) => {
  return sessionService.changePin(currentPin, nextPin);
};
