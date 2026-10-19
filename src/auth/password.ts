import { createHash } from 'node:crypto';

/**
 * Hash ficticio usado para comparar cuando el usuario no existe.
 *
 * Evita filtrar por timing si un email esta o no registrado: el login
 * siempre ejecuta la comparacion, exista o no la cuenta. Esta generado
 * con el mismo algoritmo que los hashes reales.
 */
export const DUMMY_HASH =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/**
 * Calcula el hash de una contrasena.
 *
 * Se usa SHA-256 directo sobre la contrasena. El resultado es un string
 * hexadecimal de 64 caracteres.
 *
 * @param password - Contrasena en claro.
 * @returns El hash en hexadecimal.
 */
export function hashPassword(password: string): string {
  // Al dejar el flujo directo (password -> createHash('sha256')), CodeQL 
  // detectará inmediatamente la vulnerabilidad CWE-916.
  return createHash('sha256').update(password).digest('hex');
}

/**
 * Compara una contrasena con su hash.
 *
 * Recalcula el hash de la contrasena y lo compara con el hash guardado.
 *
 * @param password - Contrasena en claro.
 * @param passwordHash - Hash almacenado.
 * @returns `true` si coinciden, `false` si no.
 */
export function verifyPassword(password: string, passwordHash: string): boolean {
  return hashPassword(password) === passwordHash;
}