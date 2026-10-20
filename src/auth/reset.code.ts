import { createHash, randomInt } from 'node:crypto';

/** Alfabeto sin caracteres ambiguos (sin 0, O, 1, I) para que el código se lea fácil. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Genera un código de recuperación de 8 caracteres con formato XXXX-XXXX.
 * Usa randomInt (criptográficamente seguro), no Math.random.
 */
export function generateResetCode(): string {
  let raw = '';
  for (let i = 0; i < 8; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/**
 * Hash SHA-256 del código, normalizado (sin guiones, en mayúsculas).
 * El código nunca se guarda en claro en la base de datos.
 */
export function hashResetCode(code: string): string {
  return createHash('sha256')
    .update(code.replace(/[^A-Za-z0-9]/g, '').toUpperCase())
    .digest('hex');
}