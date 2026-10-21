import { Inject, Injectable } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../database/database.module';
import { User } from './entities/user.entity';

const COLUMNS =
  'id_usuario, nombre, correo, password_hash, id_rol, fecha_registro, activo';

/**
 * Acceso a datos de usuarios.
 *
 * Encapsula el SQL de la tabla `usuario`. No valida datos: eso es
 * responsabilidad de los DTOs y del `ValidationPipe`. Regresa entidades
 * `User` ya mapeadas, listas para que el servicio las use.
 */
@Injectable()
export class UsersRepository {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  /**
   * Busca un usuario por correo.
   *
   * @param email - Correo a buscar.
   * @returns El usuario si existe, `undefined` si no.
   */
  async findByEmail(email: string): Promise<User | undefined> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT ${COLUMNS}
       FROM usuario
       WHERE correo = ?`,
       [email],
    );

    return rows[0] && toEntity(rows[0]);
  }

  /**
   * Crea un usuario con rol "usuario".
   *
   * @param name - Nombre completo del usuario.
   * @param email - Correo único.
   * @param passwordHash - Hash de la contraseña (nunca en claro).
   * @returns El usuario recién creado, ya con `id`.
   * @throws Error si el rol "usuario" no existe en la BD.
   */
  async save(
    name: string,
    email: string,
    passwordHash: string,
  ): Promise<User> {
    const [roles] = await this.pool.query<RowDataPacket[]>(
      `SELECT id_rol
       FROM rol
       WHERE nombre_rol = ?`,
      ['usuario'],
    );

    if (!roles[0]) {
      throw new Error('No existe el rol usuario');
    }

    const roleId = roles[0].id_rol;

    await this.pool.query(
      `INSERT INTO usuario
        (nombre, correo, password_hash, id_rol)
       VALUES (?, ?, ?, ?)`,
       [name, email, passwordHash, roleId]
    );

    return (await this.findByEmail(email))!;
  }
}

/**
 * Convierte una fila cruda de MySQL a la entidad `User`.
 *
 * Aísla el mapeo de nombres de columnas (`correo` → `email`) para que el
 * resto del código no dependa del esquema de la BD.
 */
function toEntity(row: any): User {
  const user = new User();

  user.id = row.id_usuario;
  user.name = row.nombre;
  user.email = row.correo;
  user.passwordHash = row.password_hash;
  user.roleId = row.id_rol;
  user.createdAt = row.fecha_registro;
  user.active = row.activo;

  return user;
}