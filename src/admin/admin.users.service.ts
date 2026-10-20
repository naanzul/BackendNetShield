import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';

type Status = 'pending' | 'approved' | 'rejected';

function toStatus(name: string): Status {
  const value = name.toLowerCase();
  if (value.startsWith('aprob')) return 'approved';
  if (value.startsWith('rechaz')) return 'rejected';
  return 'pending';
}

@Injectable()
export class AdminUsersService {
  constructor(
    @Inject('DB_POOL')
    private readonly pool: Pool,
  ) {}

  async list() {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT
         u.id_usuario AS id,
         u.nombre AS name,
         u.correo AS email,
         DATE_FORMAT(u.fecha_registro, '%Y-%m-%d') AS registeredAt,
         u.activo AS active,
         COUNT(r.id_reporte) AS reports
       FROM usuario u
       INNER JOIN rol ro ON u.id_rol = ro.id_rol
       LEFT JOIN reporte r ON r.id_usuario = u.id_usuario
       WHERE ro.nombre_rol <> 'admin'
       GROUP BY u.id_usuario, u.nombre, u.correo, u.fecha_registro, u.activo
       ORDER BY u.fecha_registro DESC`,
    );

    return rows.map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      email: String(row.email),
      registeredAt: String(row.registeredAt),
      active: Boolean(row.active),
      reports: Number(row.reports),
    }));
  }

  async detail(id: number) {
    const [users] = await this.pool.query<RowDataPacket[]>(
      `SELECT
         u.id_usuario AS id,
         u.nombre AS name,
         u.correo AS email,
         DATE_FORMAT(u.fecha_registro, '%Y-%m-%d') AS registeredAt,
         u.activo AS active
       FROM usuario u
       INNER JOIN rol ro ON u.id_rol = ro.id_rol
       WHERE u.id_usuario = ? AND ro.nombre_rol <> 'admin'`,
      [id],
    );

    if (users.length === 0) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const [reports] = await this.pool.query<RowDataPacket[]>(
      `SELECT
         r.id_reporte AS id,
         s.url AS url,
         c.nombre AS category,
         e.nombre_estado AS status,
         DATE_FORMAT(r.fecha_reporte, '%Y-%m-%d') AS date
       FROM reporte r
       INNER JOIN sitio s ON r.id_sitio = s.id_sitio
       INNER JOIN subcategoria c ON r.id_subcategoria = c.id_subcategoria
       INNER JOIN estado_reporte e ON r.id_estado_reporte = e.id_estado_reporte
       WHERE r.id_usuario = ?
       ORDER BY r.fecha_reporte DESC`,
      [id],
    );

    const user = users[0];

    return {
      id: Number(user.id),
      name: String(user.name),
      email: String(user.email),
      registeredAt: String(user.registeredAt),
      active: Boolean(user.active),
      reports: reports.map((row) => ({
        id: String(row.id),
        url: String(row.url),
        category: String(row.category),
        status: toStatus(String(row.status)),
        date: String(row.date),
      })),
    };
  }

  async setStatus(id: number, active: boolean) {
    const [users] = await this.pool.query<RowDataPacket[]>(
      `SELECT u.id_usuario
       FROM usuario u
       INNER JOIN rol ro ON u.id_rol = ro.id_rol
       WHERE u.id_usuario = ? AND ro.nombre_rol <> 'admin'`,
      [id],
    );

    if (users.length === 0) {
      throw new NotFoundException('Usuario no encontrado');
    }

    await this.pool.query('UPDATE usuario SET activo = ? WHERE id_usuario = ?', [
      active ? 1 : 0,
      id,
    ]);

    return { id, active };
  }
}