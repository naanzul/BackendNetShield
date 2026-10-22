import 'dotenv/config';
import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto'; // <-- Agregado timingSafeEqual

// Se lee la variable de entorno (Mitigación de CWE-798: Hardcoded Credentials)
const SECRET = process.env.JWT_SECRET;

if (!SECRET) {
  throw new Error('FATAL: La variable de entorno JWT_SECRET no está definida.');
}

/**
 * Payload que viaja dentro del token.
 *
 * `sub` es el id del usuario (como string por compatibilidad con JWT),
 * `type` distingue un access token de un refresh token, e `iat` y `exp`
 * son segundos Unix. El `type` permite rechazar un refresh token en
 * rutas que esperan un access.
 */
export interface JwtPayload {
  sub: string;
  email: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

/**
 * Regresa el tiempo actual en segundos Unix.
 *
 * Se usa para `iat` y `exp`. Aislarlo facilita reemplazarlo en pruebas
 * por un reloj falso.
 */
function now(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Codifica un objeto JSON en base64url, el formato que JWT exige para
 * header y payload.
 *
 * @param json - Objeto a codificar.
 * @returns El string base64url, sin `=` de relleno.
 */
function b64url(json: object): string {
  return Buffer.from(JSON.stringify(json)).toString('base64url');
}

/**
 * Calcula la firma HMAC-SHA256 de un string.
 *
 * @param data - Contenido a firmar, normalmente `header.payload`.
 * @returns La firma en base64url.
 */
function hmac(data: string): string {
  return createHmac('sha256', SECRET as string).update(data).digest('base64url');
}

/**
 * Firma un payload y regresa el JWT completo.
 *
 * El header se fija en `{ alg: 'HS256', typ: 'JWT' }`. Al payload se le
 * agregan `iat` y `exp` calculados desde ahora.
 *
 * @param payload - Claims sin `iat` ni `exp`.
 * @param ttlSeconds - Vida del token en segundos, contada desde ahora.
 * @returns El token como `header.payload.signature`.
 */
export function sign(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  ttlSeconds: number,
): string {
  const header = b64url({
    alg: 'HS256',
    typ: 'JWT',
  });

  const body = b64url({
    ...payload,
    iat: now(),
    exp: now() + ttlSeconds,
  });

  const signature = hmac(`${header}.${body}`);

  return `${header}.${body}.${signature}`;
}

/**
 * Verifica un token y regresa su payload.
 *
 * Recalcula la firma con el mismo secret y compara. Si la firma no
 * coincide, el token esta mal formado o ya expiro, regresa `null`.
 *
 * @param token - El JWT tal como llego, sin `Bearer `.
 * @returns El payload si es valido, `null` en cualquier otro caso.
 */
export function verify(token: string): JwtPayload | null {
  const parts = token.split('.');

  // MITIGACIÓN #11: Validar que el token tenga exactamente 3 partes (header, body, signature)
  if (parts.length !== 3) {
    return null;
  }

  const [header, body, signature] = parts;

  // MITIGACIÓN #11: Validar que el algoritmo sea HS256 (evita ataque 'alg: none')
  try {
    const decodedHeader = JSON.parse(Buffer.from(header, 'base64url').toString());
    if (decodedHeader.alg !== 'HS256') {
      return null;
    }
  } catch {
    return null;
  }

  // MITIGACIÓN #10: Comparación en tiempo constante para evitar Timing Attacks
  const expectedSignature = hmac(`${header}.${body}`);
  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  // Validación del payload con manejo de errores (evita que un JSON malformado tumbe el servidor)
  try {
    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString(),
    ) as JwtPayload;

    if (payload.exp < now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}