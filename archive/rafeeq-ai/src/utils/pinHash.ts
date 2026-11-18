// Copyright (c) 2026 DRS AI. All rights reserved.
import { Sha256 } from '../models/sha256';

/**
 * PIN hashing for the app lock: `hashPin` chains SHA-256 over "salt:pin" for
 * PIN_ROUNDS rounds (key stretching), so the value stored in the kv store is
 * not directly reversible and a leaked entry cannot be brute-forced instantly.
 *
 * Honest limits, documented on purpose: the salt comes from Math.random (only
 * uniqueness is needed — no crypto module ships with this dependency set), and
 * stretching is a speed bump, not disk encryption. The lock keeps casual
 * snooping out; the OS user boundary remains the real protection.
 */
export const PIN_ROUNDS = 3000;

/** PINs are exactly 4 digits (matches the pad and both setup steps). */
export const PIN_LENGTH = 4;

export function isValidPin(pin: string): boolean {
  return /^[0-9]{4}$/.test(pin);
}

/** Minimal UTF-8 encoder — avoids depending on TextEncoder at the RN runtime. */
function utf8Bytes(input: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    let code = input.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
    }
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
  }
  return new Uint8Array(bytes);
}

/** Stretched hash of a PIN with its salt; deterministic for tests and verification. */
export function hashPin(pin: string, salt: string): string {
  let hex = `${salt}:${pin}`;
  for (let i = 0; i < PIN_ROUNDS; i++) {
    hex = new Sha256().update(utf8Bytes(hex)).digestHex();
  }
  return hex;
}

/** 16 random bytes as hex. Uniqueness is all the salt needs (see the limits note above). */
export function generateSalt(): string {
  let hex = '';
  for (let i = 0; i < 16; i++)
    hex += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0');
  return hex;
}
