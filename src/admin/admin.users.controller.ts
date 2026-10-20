import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from './admin.guard';
import { AdminUsersService } from './admin.users.service';
import { UserStatusDto } from './dto/user.status.dto';

/**
 * Endpoints de gestion de usuarios desde el panel de administracion.
 *
 * Los administradores pueden listar usuarios, ver el detalle de uno y
 * activar o desactivar cuentas. Todas las rutas requieren token de
 * administrador.
 */
@ApiTags('AdminUsers')
@ApiBearerAuth()
@ApiResponse({
  status: 401,
  description: 'Falta el token, es invalido o expiro',
})
@ApiResponse({
  status: 403,
  description: 'La cuenta no es administrador o esta desactivada',
})
@UseGuards(AdminGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  /**
   * Lista todos los usuarios registrados.
   *
   * @returns Lista de usuarios con sus datos basicos.
   */
  @Get()
  @ApiOperation({
    summary: 'Listar usuarios registrados',
    description: 'Devuelve todos los usuarios con su nombre, correo, pais y estado.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de usuarios registrados',
    schema: {
      example: [
        {
          id: 4,
          name: 'Administrador',
          email: 'admin@netshield.com',
          role: 'admin',
          country: null,
          active: true,
          createdAt: '2026-10-02',
        },
        {
          id: 6,
          name: 'Ana Lopez',
          email: 'ana@example.com',
          role: 'usuario',
          country: 'Mexico',
          active: true,
          createdAt: '2026-10-05',
        },
      ],
    },
  })
  list() {
    return this.users.list();
  }

  /**
   * Devuelve el detalle de un usuario.
   *
   * @param id - Identificador del usuario.
   * @returns Los datos completos del usuario.
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Detalle de un usuario',
    description: 'Devuelve los datos completos del usuario, incluidos sus reportes y estadisticas.',
  })
  @ApiResponse({
    status: 200,
    description: 'Detalle del usuario',
    schema: {
      example: {
        id: 6,
        name: 'Ana Lopez',
        email: 'ana@example.com',
        role: 'usuario',
        country: 'Mexico',
        active: true,
        createdAt: '2026-10-05',
        reportsCount: 3,
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Usuario no encontrado',
  })
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.users.detail(id);
  }

  /**
   * Activa o desactiva una cuenta.
   *
   * @param id - Identificador del usuario.
   * @param body - Nuevo estado de la cuenta.
   * @returns El id del usuario y el nuevo estado.
   */
  @Patch(':id/status')
  @ApiOperation({
    summary: 'Activar o desactivar una cuenta',
    description:
      'Cambia el campo `activo` del usuario. Una cuenta desactivada no puede ' +
      'iniciar sesion, pero sus datos se conservan. El cambio es inmediato: el ' +
      '`UserGuard` y el `AdminGuard` consultan el estado en cada peticion.',
  })
  @ApiResponse({
    status: 200,
    description: 'Estado actualizado',
    schema: {
      example: {
        id: 6,
        active: false,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'El campo `active` falta o no es booleano',
  })
  @ApiResponse({
    status: 404,
    description: 'Usuario no encontrado',
  })
  setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UserStatusDto,
  ) {
    return this.users.setStatus(id, body.active!);
  }
}