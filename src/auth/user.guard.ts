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
import { verify } from './jwt';

export type UserRequest = Request & { userId: number };

/**
 * Guard que protege las rutas de la app de usuarios.
 *
 * Verifica el JWT del header `Authorization: Bearer <token>` y, ademas
 * de comprobar la firma, consulta la base de datos para confirmar que:
 *
 * 1. El usuario del token exista.
 * 2. La cuenta este activa.
 * 3. El rol NO sea `admin` (la app es solo para usuarios finales).
 *
 * Si todo cuadra, deja el id del usuario en `request.userId`.
 */
@Injectable()
export class UserGuard implements CanActivate {
  constructor(
    @Inject('DB_POOL')
    private readonly pool: Pool,
  ) {}

  /**
   * Verifica que la peticion venga de un usuario activo que no sea admin.
   *
   * @param context - Contexto de ejecucion de Nest con la peticion HTTP.
   * @returns `true` si el token es valido, la cuenta esta activa y el
   *   rol es de usuario final.
   * @throws UnauthorizedException si falta el token, es invalido o expiro.
   * @throws ForbiddenException si la cuenta esta desactivada o si el
   *   usuario es administrador.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
  const request = context.switchToHttp().getRequest<UserRequest>();
  const token = this.extractBearerToken(request);
  const payload = verify(token);

  if (!payload || payload.type !== 'access') {
    throw new UnauthorizedException('Token inválido o expirado');
  }

    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT u.activo, r.nombre_rol AS role
       FROM usuario u INNER JOIN rol r ON u.id_rol = r.id_rol
       WHERE u.id_usuario = ?`,
      [Number(payload.sub)],
    );

    if (rows.length === 0) {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    if (!rows[0].activo) {
      throw new ForbiddenException('Cuenta desactivada. Contacta al administrador');
    }
    if (rows[0].role === 'admin') {
      throw new ForbiddenException('Acceso solo para usuarios de la app');
    }

    request.userId = Number(payload.sub);
    return true;
  }

/** Extrae el token del header `Authorization: Bearer <token>` o rechaza la petición. */
  private extractBearerToken(request: Request): string {
  const header = request.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    throw new UnauthorizedException('Token inválido o expirado');
  }
  return header.slice('Bearer '.length);
}
}