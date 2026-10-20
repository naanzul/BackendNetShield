import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { hashPassword, verifyPassword } from '../auth/password';
import { clean, resolveCountry } from '../text.util';
import { removeFile, removeUpload, validateImage } from '../uploads';
import { UpdateProfileDto } from './dto/update.profile.dto';

@Injectable()
export class UsersService {
  constructor(
    @Inject('DB_POOL')
    private readonly pool: Pool,
  ) {}

  async profile(userId: number) {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT nombre, correo, pais, foto_perfil,
              DATE_FORMAT(fecha_registro, '%Y-%m-%d') AS registeredAt
       FROM usuario WHERE id_usuario = ?`,
      [userId],
    );
    if (!rows.length) throw new NotFoundException('Usuario no encontrado');

    const row = rows[0];
    return {
      name: String(row.nombre),
      email: String(row.correo),
      country: row.pais ? String(row.pais) : null,
      photoUrl: row.foto_perfil ? String(row.foto_perfil) : null,
      registeredAt: String(row.registeredAt),
    };
  }

  async update(userId: number, dto: UpdateProfileDto) {
    if (dto.name !== undefined) {
      await this.pool.query('UPDATE usuario SET nombre = ? WHERE id_usuario = ?', [clean(dto.name), userId]);
    }
    if (dto.country !== undefined) {
      await this.pool.query('UPDATE usuario SET pais = ? WHERE id_usuario = ?', [
        await resolveCountry(this.pool, dto.country),
        userId,
      ]);
    }
    return this.profile(userId);
  }

  async setPhoto(userId: number, file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Archivo inválido o faltante');
    const publicPath = validateImage(file, 'profile');

    try {
      const [rows] = await this.pool.query<RowDataPacket[]>(
        'SELECT foto_perfil FROM usuario WHERE id_usuario = ?',
        [userId],
      );
      await this.pool.query('UPDATE usuario SET foto_perfil = ? WHERE id_usuario = ?', [publicPath, userId]);
      if (rows[0]?.foto_perfil) removeUpload(String(rows[0].foto_perfil));
    } catch (error) {
      removeFile(file.path);
      throw error;
    }
    return this.profile(userId);
  }

  async changePassword(userId: number, current: string, next: string) {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT password_hash FROM usuario WHERE id_usuario = ?',
      [userId],
    );

    // 403 (no 401) para que el cliente NO cierre sesión: la sesión sigue
    // siendo válida, lo que falla es la contraseña actual.
    if (!rows.length || !(await verifyPassword(current, String(rows[0].password_hash)))) {
      throw new ForbiddenException('La contraseña actual es incorrecta');
    }

    if (current === next) {
      throw new BadRequestException('La contraseña nueva debe ser distinta');
    }

    await this.pool.query('UPDATE usuario SET password_hash = ? WHERE id_usuario = ?', [
      await hashPassword(next),
      userId,
    ]);
    return { message: 'Contraseña actualizada' };
  }
}