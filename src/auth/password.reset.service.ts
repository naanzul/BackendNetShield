import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { timingSafeEqual } from 'node:crypto';
import { MailService } from './mail.service';
import { hashPassword } from './password';
import { generateResetCode, hashResetCode } from './reset.code';

/** Intentos fallidos permitidos antes de invalidar el código. */
const MAX_ATTEMPTS = 5;

/** Mensaje único para código inválido, usado, expirado o bloqueado (evita dar pistas). */
const GENERIC = 'Código inválido o expirado';

/**
 * Logica de recuperacion de contrasena para usuarios de la app.
 *
 * Los administradores quedan fuera de este flujo a proposito: su acceso
 * se gestiona solo dentro del panel.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @Inject('DB_POOL')
    private readonly pool: Pool,
    private readonly mail: MailService,
  ) {}

  /**
   * Genera y envia un codigo de recuperacion si el correo pertenece a un
   * usuario activo. Responde siempre el mismo mensaje, exista o no el
   * correo, para no revelar que cuentas estan registradas. Limita a una
   * solicitud por minuto por usuario.
   * @param email Correo indicado por el usuario.
   */
  async request(email: string) {
    const [users] = await this.pool.query<RowDataPacket[]>(
      `SELECT u.id_usuario AS id
       FROM usuario u INNER JOIN rol r ON u.id_rol = r.id_rol
       WHERE u.correo = ? AND u.activo = 1 AND r.nombre_rol <> 'admin'`,
      [email],
    );

    if (users.length) {
      const userId = users[0].id;

      // Evita que una persona genere decenas de códigos en segundos.
      const [recent] = await this.pool.query<RowDataPacket[]>(
        `SELECT 1 FROM recuperacion_password
         WHERE id_usuario = ? AND fecha_solicitud > DATE_SUB(NOW(), INTERVAL 60 SECOND) LIMIT 1`,
        [userId],
      );

      if (!recent.length) {
        const code = generateResetCode();

        // Invalida cualquier código anterior sin usar antes de crear el nuevo.
        await this.pool.query(
          'UPDATE recuperacion_password SET fecha_uso = NOW() WHERE id_usuario = ? AND fecha_uso IS NULL',
          [userId],
        );
        await this.pool.query(
          `INSERT INTO recuperacion_password (id_usuario, codigo_hash, fecha_expiracion)
           VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))`,
          [userId, hashResetCode(code)],
        );

        try {
          await this.mail.sendResetCode(email, code);
        } catch (error) {
          this.logger.error('No se pudo enviar el correo de recuperación', error as Error);
        }
      }
    }

    return { message: 'Si el correo está registrado, te enviamos un código para restablecer tu contraseña.' };
  }

  /**
   * Verifica el codigo y, si es valido, actualiza la contrasena.
   * Compara el hash con tiempo constante (timingSafeEqual) para evitar
   * que la duracion de la respuesta delate si el codigo es casi correcto.
   * @param email Correo del usuario.
   * @param code Codigo recibido por correo.
   * @param newPassword Contrasena nueva, en claro (se hashea antes de guardar).
   */
  async reset(email: string, code: string, newPassword: string) {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT p.id_recuperacion AS id, p.id_usuario AS userId, p.codigo_hash AS hash
       FROM recuperacion_password p
       INNER JOIN usuario u ON p.id_usuario = u.id_usuario
       INNER JOIN rol r ON u.id_rol = r.id_rol
       WHERE u.correo = ? AND u.activo = 1 AND r.nombre_rol <> 'admin'
         AND p.codigo_hash IS NOT NULL AND p.fecha_uso IS NULL
         AND p.fecha_expiracion > NOW() AND p.intentos < ?
       ORDER BY p.id_recuperacion DESC LIMIT 1`,
      [email, MAX_ATTEMPTS],
    );

    if (!rows.length) throw new BadRequestException(GENERIC);

    const given = Buffer.from(hashResetCode(code), 'hex');
    const expected = Buffer.from(String(rows[0].hash), 'hex');

    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      await this.pool.query('UPDATE recuperacion_password SET intentos = intentos + 1 WHERE id_recuperacion = ?', [
        rows[0].id,
      ]);
      throw new BadRequestException(GENERIC);
    }

    await this.pool.query('UPDATE usuario SET password_hash = ? WHERE id_usuario = ?', [
      await hashPassword(newPassword),
      rows[0].userId,
    ]);
    await this.pool.query(
      'UPDATE recuperacion_password SET fecha_uso = NOW() WHERE id_usuario = ? AND fecha_uso IS NULL',
      [rows[0].userId],
    );

    return { message: 'Contraseña actualizada. Ya puedes iniciar sesión.' };
  }
}