import { createHash, randomBytes } from 'node:crypto';

/** Código aleatorio de 96 bits con formato AAAAAA-BBBBBB-CCCCCC-DDDDDD. */
export function generateInviteCode(): string {
  const raw = randomBytes(12).toString('hex').toUpperCase();
  return raw.match(/.{1,6}/g)!.join('-');
}

/** Hash con el que se guarda y se busca el código (nunca se guarda en claro). */
export function hashInviteCode(code: string): string {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}