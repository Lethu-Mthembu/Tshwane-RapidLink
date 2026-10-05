import { PIN_LOCKOUT_MS, PIN_MAX_ATTEMPTS } from '@/features/emergency/config';
import { readState, sessionService } from '@/features/emergency/session-service';
import type { CancellationPinRecord, ClientProfile } from '@/features/emergency/types';

const PIN_ITERATIONS = 210_000;

const bytesToBase64 = (bytes: Uint8Array) => {
  let value = '';
  bytes.forEach((byte) => { value += String.fromCharCode(byte); });
  return btoa(value);
};

const base64ToBytes = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

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

const safeEqual = (left: Uint8Array, right: Uint8Array) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index]! ^ right[index]!;
  return difference === 0;
};

export interface PinVerificationResult {
  ok: boolean;
  lockedForSeconds?: number;
  attemptsRemaining?: number;
}

export const verifyCancellationPin = async (pin: string): Promise<PinVerificationResult> => {
  let security = readState().profileSecurity;
  if (!security) return { ok: false, attemptsRemaining: 0 };
  const lockedUntil = security.lockedUntil ? Date.parse(security.lockedUntil) : 0;
  if (lockedUntil > Date.now()) return { ok: false, lockedForSeconds: Math.ceil((lockedUntil - Date.now()) / 1000), attemptsRemaining: 0 };
  if (security.lockedUntil) {
    sessionService.clearPinFailures();
    security = readState().profileSecurity;
    if (!security) return { ok: false, attemptsRemaining: 0 };
  }
  const derived = await derivePin(pin, base64ToBytes(security.salt), security.iterations);
  if (safeEqual(derived, base64ToBytes(security.derivedHash))) {
    sessionService.clearPinFailures();
    return { ok: true, attemptsRemaining: PIN_MAX_ATTEMPTS };
  }
  const failedAttempts = security.failedAttempts + 1;
  const lockedUntilIso = failedAttempts >= PIN_MAX_ATTEMPTS ? new Date(Date.now() + PIN_LOCKOUT_MS).toISOString() : undefined;
  sessionService.recordPinFailure(lockedUntilIso);
  return {
    ok: false,
    lockedForSeconds: lockedUntilIso ? Math.ceil(PIN_LOCKOUT_MS / 1000) : undefined,
    attemptsRemaining: Math.max(0, PIN_MAX_ATTEMPTS - failedAttempts),
  };
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
  const verification = await verifyCancellationPin(currentPin);
  if (!verification.ok) return verification;
  sessionService.changePin(await createPinRecord(nextPin));
  return { ok: true, attemptsRemaining: PIN_MAX_ATTEMPTS } satisfies PinVerificationResult;
};
