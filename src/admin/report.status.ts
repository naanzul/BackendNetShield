export type ReportStatus = 'pending' | 'approved' | 'rejected';

/** Traduce el nombre guardado en estado_reporte al valor que usa el panel. */
export function toStatus(name: string): ReportStatus {
  const value = name.toLowerCase();
  if (value.startsWith('desaprob') || value.startsWith('rechaz')) return 'rejected';
  if (value.startsWith('aprob') || value === 'resuelto') return 'approved';
  return 'pending';
}

/** Condiciones SQL equivalentes (la tabla estado_reporte debe tener el alias "e"). */
export const SQL_APPROVED = `(LOWER(e.nombre_estado) LIKE 'aprob%' OR LOWER(e.nombre_estado) = 'resuelto')`;
export const SQL_REJECTED = `(LOWER(e.nombre_estado) LIKE 'desaprob%' OR LOWER(e.nombre_estado) LIKE 'rechaz%')`;
export const SQL_PENDING = `(NOT ${SQL_APPROVED} AND NOT ${SQL_REJECTED})`;

export type UserReportStatus = 'En revisión' | 'Aprobado' | 'Desaprobado';

/** Etiqueta que ve el usuario de la app. No incluye observaciones ni datos internos. */
export function toUserStatus(name: string): UserReportStatus {
  const status = toStatus(name);
  if (status === 'approved') return 'Aprobado';
  if (status === 'rejected') return 'Desaprobado';
  return 'En revisión';
}