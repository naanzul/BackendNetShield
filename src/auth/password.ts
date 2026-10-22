import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SALT_BYTES = 16;
const KEY_BYTES = 64;
const SEPARATOR = '$';

/**
 * Calcula el hash de una contrasena con sal aleatoria y scrypt.
 *
 * scrypt es lento y consume memoria a proposito: encarece cada intento
 * de fuerza bruta si la tabla users se filtra. La sal hace que la misma
 * contrasena produzca un hash distinto en cada usuario.
 * @param password - Contrasena en claro.
 * @returns `sal:hash`, ambos en hexadecimal (cabe en VARCHAR(255)).
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const key = scryptSync(password, salt, KEY_BYTES).toString('hex');
  return `${salt}${SEPARATOR}${key}`;
}

/**
 * Hash ficticio usado para comparar cuando el usuario no existe.
 *
 * Evita filtrar por timing si un email esta o no registrado: el login
 * siempre ejecuta la comparacion, exista o no la cuenta. Esta generado
 * con el mismo algoritmo que los hashes reales.
 */
export const DUMMY_HASH = hashPassword(randomBytes(SALT_BYTES).toString('hex'));

/**
 * Compara una contrasena con su hash almacenado.
 *
 * Recalcula scrypt con la sal guardada y compara en tiempo constante
 * (timingSafeEqual), para que el tiempo de respuesta no revele cuantos
 * bytes del hash coinciden.
 *
 * @param password - Contrasena en claro.
 * @param passwordHash - Valor almacenado con formato `sal$hash`.
 * @returns `true` si coinciden, `false` si no (o si el formato es invalido).
 */
export function verifyPassword(password: string, passwordHash: string): boolean {
  const [salt, storedKey] = passwordHash.split(SEPARATOR);
  if (!salt || !storedKey) return false;
 
  const expected = Buffer.from(storedKey, 'hex');
  const actual = scryptSync(password, salt, expected.length);
 
  return expected.length > 0 && timingSafeEqual(actual, expected);
}