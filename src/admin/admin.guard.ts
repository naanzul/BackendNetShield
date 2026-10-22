import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { extractBearerToken } from '../auth/bearer';
import { verify } from '../auth/jwt';
 
export type AdminRequest = Request & { adminId: number };

/**
 * Guard que protege rutas exclusivas de administradores.
 *
 * Verifica el JWT del header `Authorization: Bearer <token>` y, ademas
 * de comprobar la firma, consulta la base de datos para confirmar que:
 *
 * 1. El usuario del token exista.
 * 2. Su rol sea `admin`.
 * 3. La cuenta este activa.
 *
 * Si todo cuadra, deja el id del administrador en `request.adminId`.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @Inject('DB_POOL')
    private readonly pool: Pool,
  ) {}

  /**
   * Verifica que la peticion venga de un administrador activo.
   *
   * @param context - Contexto de ejecucion de Nest con la peticion HTTP.
   * @returns `true` si el token es valido, el usuario es admin y esta activo.
   * @throws UnauthorizedException si falta el token, es invalido o expiro.
   * @throws ForbiddenException si el usuario no es admin o esta desactivado.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const token = extractBearerToken(request);

    // 1. Validamos que el token exista (Soluciona el error de TypeScript)
    if (!token) {
      throw new UnauthorizedException('Token no proporcionado');
    }

    // 2. Ahora TypeScript sabe que 'token' es un string seguro
    const payload = verify(token);
 
    if (!payload || payload.type !== 'access') {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT u.id_usuario
       FROM usuario u
       INNER JOIN rol r ON u.id_rol = r.id_rol
       WHERE u.id_usuario = ?
       AND r.nombre_rol = ?
       AND u.activo = 1`,
      [Number(payload.sub), 'admin'],
    );

    if (rows.length === 0) {
      throw new ForbiddenException('Acceso solo para administradores');
    }

    request.adminId = Number(payload.sub);
    return true;
  }
}