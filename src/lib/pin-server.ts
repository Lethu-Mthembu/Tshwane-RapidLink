import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

import type { CancellationPinRecord } from '../features/emergency/types.js';

const PIN_ITERATIONS = 210_000;

export function verifyPin(pin: string, security: CancellationPinRecord) {
  const expected = Buffer.from(security.derivedHash, 'base64');
  const actual = pbkdf2Sync(pin, Buffer.from(security.salt, 'base64'), security.iterations, expected.length, 'sha256');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createPinRecord(pin: string): CancellationPinRecord {
  const salt = randomBytes(16);
  return {
    salt: salt.toString('base64'),
    derivedHash: pbkdf2Sync(pin, salt, PIN_ITERATIONS, 32, 'sha256').toString('base64'),
    iterations: PIN_ITERATIONS,
    failedAttempts: 0,
  };
}
