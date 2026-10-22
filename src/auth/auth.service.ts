import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomInt } from 'node:crypto';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { resolveCountry } from '../text.util';
import { ForgotPasswordDto } from './dto/forgot.password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset.password.dto';
import { sign, verify } from './jwt';
import { hashPassword, verifyPassword } from './password';
import { UsersRepository } from './users.repository';

const ACCESS_TTL = 15 * 60;
const REFRESH_TTL = 7 * 24 * 60 * 60;
const RECOVERY_TTL_MINUTES = 15;

export type Audience = 'user' | 'admin';

/**
 * Reglas de negocio de autenticacion.
 *
 * No sabe de HTTP ni de SQL: recibe DTOs ya validados por el
 * `ValidationPipe`, habla con el `UsersRepository` y con el pool para
 * consultas puntuales, y regresa tokens firmados. Los errores de negocio
 * se expresan como excepciones de Nest para que el controller no tenga
 * que traducirlas.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    @Inject('DB_POOL')
    private readonly pool: Pool,
  ) {}

  /**
   * Consulta el estado y rol del usuario en la base de datos.
   *
   * Se usa en login y refresh para verificar que la cuenta siga activa y
   * que el rol corresponda a la audiencia solicitada.
   *
   * @param userId - Identificador del usuario.
   * @returns El estado y rol, o `null` si el usuario no existe.
   */
  private async account(
    userId: number,
  ): Promise<{ active: boolean; role: string } | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT u.activo, r.nombre_rol AS role
       FROM usuario u INNER JOIN rol r ON u.id_rol = r.id_rol
       WHERE u.id_usuario = ?`,
      [userId],
    );
    return rows.length
      ? { active: Boolean(rows[0].activo), role: String(rows[0].role) }
      : null;
  }

  /**
   * Crea un usuario con rol "usuario".
   *
   * Falla con 409 si el correo ya esta registrado. El pais se resuelve
   * contra la tabla de paises; si no existe, se guarda el valor tal cual.
   *
   * @param dto - Datos ya validados del formulario de registro.
   * @returns El id y correo del usuario creado.
   * @throws ConflictException si el correo ya existe.
   */
  async register(dto: RegisterDto): Promise<{ id: number; email: string }> {
    if (await this.users.findByEmail(dto.email)) {
      throw new ConflictException('El email ya está registrado');
    }

    const user = await this.users.save(
      dto.name,
      dto.email,
      await hashPassword(dto.password), // <-- AWAIT AGREGADO
    );
    await this.pool.query('UPDATE usuario SET pais = ? WHERE id_usuario = ?', [
      await resolveCountry(this.pool, dto.country),
      user.id!,
    ]);

    return { id: user.id!, email: user.email! };
  }

  /**
   * Valida credenciales y regresa un par de tokens.
   *
   * La audiencia distingue entre la app del usuario (`user`) y el panel
   * de administracion (`admin`). Un usuario con rol "admin" no puede
   * entrar por `user` ni un usuario normal por `admin`.
   *
   * @param dto - Correo y contrasena.
   * @param audience - Audiencia solicitada. Por defecto, `user`.
   * @returns Un access token de 15 minutos y un refresh token de 7 dias.
   * @throws UnauthorizedException si las credenciales no son validas o
   *   el rol no corresponde a la audiencia.
   * @throws ForbiddenException si la cuenta esta desactivada.
   */
  async login(
    dto: LoginDto,
    audience: Audience = 'user',
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.users.findByEmail(dto.email!);

    // MITIGACIÓN: Enumeración de usuarios (Mensaje genérico unificado)
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const valid = await verifyPassword(dto.password!, user!.passwordHash!); // <-- AWAIT AGREGADO

    if (!valid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const account = await this.account(user!.id!);
    if (!account || (account.role === 'admin') !== (audience === 'admin')) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    if (!account.active) {
      throw new ForbiddenException('Cuenta desactivada. Contacta al administrador');
    }

    const claims = { sub: String(user!.id!), email: user!.email! };
    const accessToken = sign({ ...claims, type: 'access' }, ACCESS_TTL);
    const refreshToken = sign({ ...claims, type: 'refresh' }, REFRESH_TTL);

    // MITIGACIÓN: Fuga de token en logs (Línea comentada)
    // console.log('Login de ' + user!.email + ': ' + accessToken);

    return { accessToken, refreshToken };
  }

  /**
   * Emite un access token nuevo a partir de un refresh token valido.
   *
   * Vuelve a consultar el estado de la cuenta: si el usuario fue
   * desactivado o eliminado despues de emitir el refresh, se rechaza.
   *
   * @param dto - El refresh token tal como llego del cliente.
   * @returns Un access token nuevo.
   * @throws UnauthorizedException si el refresh es invalido, expiro o el
   *   usuario ya no esta activo.
   */
  async refresh(dto: RefreshDto): Promise<{ accessToken: string }> {
    const payload = verify(dto.refreshToken!);
    const account = payload ? await this.account(Number(payload.sub)) : null;

    if (!payload || payload.type !== 'refresh' || !account || !account.active) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    return {
      accessToken: sign(
        { sub: payload.sub, email: payload.email, type: 'access' },
        ACCESS_TTL,
      ),
    };
  }

  /**
   * Genera un codigo de recuperacion de 6 digitos y lo guarda hasheado.
   *
   * El codigo se imprime en la consola (modo desarrollo) porque todavia
   * no hay servidor de email configurado. La respuesta siempre es la
   * misma, exista o no el correo, para no revelar cuentas registradas.
   *
   * @param dto - Correo de la cuenta.
   * @returns Un mensaje generico.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const generic = {
      message: 'Si el correo existe, recibiras un codigo de recuperacion',
    };

    const user = await this.users.findByEmail(dto.email);
    if (!user) return generic;

    const code = String(randomInt(100000, 1000000));

    await this.pool.query(
      `INSERT INTO token_recuperacion (id_usuario, codigo_hash, fecha_expiracion)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
      [user.id, hashToken(code), RECOVERY_TTL_MINUTES],
    );

 
    console.log('CODIGO DE RECUPERACION');
    console.log('Usuario: ' + user.email);
    console.log('Codigo: ' + code);
    console.log('Expira en ' + RECOVERY_TTL_MINUTES + ' minutos');

    return generic;
  }

  /**
   * Restablece la contrasena con un codigo de recuperacion valido.
   *
   * Verifica que el codigo exista, no este usado y no haya expirado.
   * Si todo cuadra, actualiza el `password_hash` y marca el codigo
   * como usado (un solo uso).
   *
   * @param dto - Correo, codigo y contrasena nueva.
   * @returns Un mensaje de exito.
   * @throws BadRequestException si el codigo es invalido o expiro.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const user = await this.users.findByEmail(dto.email);

    if (!user) {
      throw new BadRequestException('Codigo invalido o expirado');
    }

    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id_token FROM token_recuperacion
       WHERE id_usuario = ? AND codigo_hash = ? AND usado = FALSE
         AND fecha_expiracion > NOW()
       ORDER BY id_token DESC
       LIMIT 1`,
      [user.id, hashToken(dto.code)],
    );

    if (!rows.length) {
      throw new BadRequestException('Codigo invalido o expirado');
    }

    await this.pool.query(
      'UPDATE token_recuperacion SET usado = TRUE WHERE id_token = ?',
      [rows[0].id_token],
    );

    await this.pool.query(
      'UPDATE usuario SET password_hash = ? WHERE id_usuario = ?',
      [await hashPassword(dto.newPassword), user.id], // <-- AWAIT AGREGADO
    );

    return { message: 'Contraseña actualizada correctamente' };
  }
}

/**
 * Calcula el hash SHA-256 de un codigo de recuperacion.
 *
 * Nunca se guarda el codigo en claro: solo su hash. Asi, aunque alguien
 * lea la tabla, no puede usar los codigos.
 *
 * @param code - Codigo de 6 digitos.
 * @returns El hash en hexadecimal (64 caracteres).
 */
function hashToken(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}