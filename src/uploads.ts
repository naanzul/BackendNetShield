import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { randomBytes } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readSync, unlinkSync } from 'node:fs';
import { diskStorage } from 'multer';
import { extname, join, resolve, sep } from 'node:path';
 
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
 
const UPLOADS_DIR = resolve(process.cwd(), 'uploads');
const MAGIC_BYTES_LENGTH = 12;
 
/** Configuración de multer: carpeta, tamaño máximo en MB y solo imágenes. */
export function imageUpload(folder: string, maxMb: number) {
  const dir = join(UPLOADS_DIR, folder);
  mkdirSync(dir, { recursive: true });
 
  return {
    storage: diskStorage({
      destination: dir,
      filename: (_req: Request, file: Express.Multer.File, cb: (e: Error | null, name: string) => void) =>
        cb(null, `${randomBytes(16).toString('hex')}.${EXT_BY_MIME[file.mimetype] ?? 'bin'}`),
    }),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
    fileFilter: (_req: Request, file: Express.Multer.File, cb: (e: Error | null, ok: boolean) => void) =>
      EXT_BY_MIME[file.mimetype]
        ? cb(null, true)
        : cb(new BadRequestException('Solo se permiten imágenes JPG, PNG o WEBP'), false),
  };
}
 
function detect(path: string): string | null {
  const full = resolve(path);
  if (!full.startsWith(UPLOADS_DIR + sep)) return null;
 
  const fd = openSync(full, 'r');
  const buf = Buffer.alloc(MAGIC_BYTES_LENGTH);
  try {
    readSync(fd, buf, 0, MAGIC_BYTES_LENGTH, 0);
  } finally {
    closeSync(fd);
  }
 
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return 'png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'webp';
  }
  return null;
}
 
/** Comprueba el contenido real del archivo y devuelve su ruta pública. */
export function validateImage(file: Express.Multer.File | undefined, folder: string): string {
  if (!file) throw new BadRequestException('Archivo inválido o faltante');
 
  const kind = detect(file.path);
  if (!kind || kind !== extname(file.filename).slice(1)) {
    removeFile(file.path);
    throw new BadRequestException('El archivo no es una imagen válida');
  }
  return `/uploads/${folder}/${file.filename}`;
}
 
/**
 * Borra un archivo. La contención en uploads/ se verifica aquí, justo antes
 * de unlinkSync: ninguna ruta que salga de uploads/ puede llegar al borrado.
 * El `+ sep` evita que /app/uploads-secret pase como si estuviera en /app/uploads.
 */
export function removeFile(path: string) {
  const full = resolve(path);
  if (!full.startsWith(UPLOADS_DIR + sep)) return;
 
  try {
    unlinkSync(full);
  } catch {
    /* ya no existe */
  }
}
 
/** Borra un archivo a partir de su ruta pública, sin salir de uploads/. */
export function removeUpload(publicPath: string) {
  removeFile(resolve(process.cwd(), '.' + publicPath.replace(/\\/g, '/')));
}