import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const SALT_BYTES = 16;
const KEY_BYTES = 64;
const SEPARATOR = ':'; 

/**
 * Calcula el hash de una contrasena con sal aleatoria y scrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const key = (await scryptAsync(password, salt, KEY_BYTES)) as Buffer;
  return `${salt}${SEPARATOR}${key.toString('hex')}`;
}

/**
 * Hash ficticio usado para comparar cuando el usuario no existe.
 * (Se genera una sola vez al arrancar el servidor).
 */
export const DUMMY_HASH = `${randomBytes(SALT_BYTES).toString('hex')}${SEPARATOR}${randomBytes(KEY_BYTES).toString('hex')}`;

/**
 * Compara una contrasena con su hash almacenado.
 */
export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  const [salt, storedKey] = passwordHash.split(SEPARATOR);
  if (!salt || !storedKey) return false;
 
  const expected = Buffer.from(storedKey, 'hex');
  const actual = (await scryptAsync(password, salt, expected.length)) as Buffer;
 
  return expected.length > 0 && timingSafeEqual(actual, expected);
}