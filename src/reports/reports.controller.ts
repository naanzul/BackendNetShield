import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { UserGuard } from '../auth/user.guard';
import type { UserRequest } from '../auth/user.guard';
import { imageUpload } from '../uploads';
import { CreateReportDto } from './dto/create.report.dto';
import { UpdateReportDto } from './dto/update.report.dto';
import { ReportsService } from './reports.service';

/**
 * Endpoints de gestion de reportes del usuario autenticado.
 */
@ApiTags('reports')
@ApiBearerAuth()
@ApiResponse({
  status: 401,
  description: 'Falta el token, es invalido o expiro',
})
@ApiResponse({
  status: 403,
  description: 'La cuenta esta desactivada o no es un usuario de la app',
})
@UseGuards(UserGuard, ThrottlerGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Crear un reporte',
    description:
      'Crea un reporte y avisa a todos los administradores activos mediante ' +
      'una notificacion. Limite: 10 reportes por minuto por usuario.',
  })
  @ApiResponse({
    status: 201,
    description: 'Reporte creado',
    schema: {
      example: {
        id: 42,
        url: 'sitio-sospechoso.com',
        category: 'Bancos',
        status: 'En revision',
        description: 'El sitio solicita datos bancarios.',
        createdAt: '2026-10-09T14:30:00.000Z',
        evidenceUrls: [],
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Datos invalidos (URL mal formada, categoria desconocida, descripcion vacia)',
  })
  @ApiResponse({
    status: 409,
    description: 'Ya reportaste este sitio y sigue en revision',
  })
  @ApiResponse({
    status: 429,
    description: 'Demasiadas peticiones. Espera un minuto',
  })
  create(@Req() req: UserRequest, @Body() dto: CreateReportDto) {
    return this.reports.create(req.userId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar mis reportes',
    description: 'Devuelve todos los reportes del usuario autenticado, ordenados por fecha descendente.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de reportes del usuario',
    schema: {
      example: [
        {
          id: 42,
          url: 'sitio-sospechoso.com',
          category: 'Bancos',
          status: 'En revision',
          description: 'El sitio solicita datos bancarios.',
          createdAt: '2026-10-09T14:30:00.000Z',
          evidenceUrls: ['/uploads/evidence/ab12.jpg'],
        },
      ],
    },
  })
  findAll(@Req() req: UserRequest) {
    return this.reports.findAll(req.userId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Ver un reporte mio',
    description: 'Devuelve un reporte especifico del usuario autenticado.',
  })
  @ApiResponse({
    status: 200,
    description: 'Detalle del reporte',
    schema: {
      example: {
        id: 42,
        url: 'sitio-sospechoso.com',
        category: 'Bancos',
        status: 'En revision',
        description: 'El sitio solicita datos bancarios.',
        createdAt: '2026-10-09T14:30:00.000Z',
        evidenceUrls: ['/uploads/evidence/ab12.jpg'],
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'El ID enviado no es un número válido', // <-- Mitigación #19
  })
  @ApiResponse({
    status: 404,
    description: 'No existe el reporte o no pertenece al usuario',
  })
  findOne(@Req() req: UserRequest, @Param('id', ParseIntPipe) id: number) {
    return this.reports.findOne(req.userId, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Editar la descripcion de un reporte',
    description:
      'Cambia la descripcion de un reporte. Solo funciona mientras el ' +
      'reporte siga en estado `pendiente` o `en_revision`.',
  })
  @ApiResponse({
    status: 200,
    description: 'Reporte actualizado',
    schema: {
      example: {
        id: 42,
        url: 'sitio-sospechoso.com',
        category: 'Bancos',
        status: 'En revision',
        description: 'Descripcion corregida.',
        createdAt: '2026-10-09T14:30:00.000Z',
        evidenceUrls: [],
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Datos invalidos (descripcion vacia o mayor a 2000 caracteres)',
  })
  @ApiResponse({
    status: 403,
    description: 'El reporte ya fue aprobado o rechazado y no se puede editar',
  })
  @ApiResponse({
    status: 404,
    description: 'No existe el reporte o no pertenece al usuario',
  })
  update(@Req() req: UserRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateReportDto) {
    return this.reports.update(req.userId, id, dto.description);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Borrar un reporte',
    description:
      'Borra el reporte y sus evidencias asociadas. Solo funciona mientras ' +
      'el reporte siga en estado `pendiente` o `en_revision`.',
  })
  @ApiResponse({
    status: 204,
    description: 'Reporte borrado; sin cuerpo',
  })
  @ApiResponse({
    status: 403,
    description: 'El reporte ya fue aprobado o rechazado y no se puede borrar',
  })
  @ApiResponse({
    status: 404,
    description: 'No existe el reporte o no pertenece al usuario',
  })
  remove(@Req() req: UserRequest, @Param('id', ParseIntPipe) id: number) {
    return this.reports.remove(req.userId, id);
  }

  @Post(':id/evidence')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Subir evidencia fotografica',
    description:
      'Sube una imagen (JPG, PNG o WEBP, maximo 5 MB) al reporte. Limite: ' +
      '5 evidencias por reporte y 20 subidas por minuto por usuario.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Archivo de imagen (JPG, PNG o WEBP, maximo 5 MB)',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Evidencia subida',
    schema: {
      example: {
        id: 42,
        url: 'sitio-sospechoso.com',
        category: 'Bancos',
        status: 'En revision',
        description: 'El sitio solicita datos bancarios.',
        createdAt: '2026-10-09T14:30:00.000Z',
        evidenceUrls: ['/uploads/evidence/ab12.jpg'],
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Archivo faltante, formato no permitido o tamano mayor a 5 MB',
  })
  @ApiResponse({
    status: 403,
    description: 'El reporte ya fue aprobado o rechazado y no se puede modificar',
  })
  @ApiResponse({
    status: 404,
    description: 'No existe el reporte o no pertenece al usuario',
  })
  @ApiResponse({
    status: 409,
    description: 'Ya hay 5 evidencias en este reporte', // <-- Mitigación #15
  })
  @ApiResponse({
    status: 429,
    description: 'Demasiadas peticiones. Espera un minuto',
  })
  @UseInterceptors(FileInterceptor('file', imageUpload('evidence', 5)))
  addEvidence(
    @Req() req: UserRequest,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.reports.addEvidence(req.userId, id, file);
  }

  @Get(':id/evidence')
  @ApiOperation({
    summary: 'Consultar las evidencias de un reporte mio',
    description: 'Devuelve las URLs publicas de las evidencias asociadas al reporte.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de evidencias',
    schema: {
      example: [
        { id: 1, url: '/uploads/evidence/ab12.jpg' },
        { id: 2, url: '/uploads/evidence/cd34.jpg' },
      ],
    },
  })
  @ApiResponse({
    status: 400,
    description: 'El ID enviado no es un número válido', // <-- Mitigación #19
  })
  @ApiResponse({
    status: 404,
    description: 'No existe el reporte o no pertenece al usuario',
  })
  listEvidence(@Req() req: UserRequest, @Param('id', ParseIntPipe) id: number) {
    return this.reports.listEvidence(req.userId, id);
  }
}

/**
 * Endpoints para eliminar evidencias individuales.
 */
@ApiTags('reports')
@ApiBearerAuth()
@ApiResponse({
  status: 401,
  description: 'Falta el token, es invalido o expiro',
})
@ApiResponse({
  status: 403,
  description: 'La cuenta esta desactivada o el reporte ya fue moderado',
})
@UseGuards(UserGuard, ThrottlerGuard)
@Controller('evidence')
export class EvidenceController {
  constructor(private readonly reports: ReportsService) {}

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Eliminar una evidencia mia',
    description:
      'Borra la evidencia y el archivo del disco. Solo funciona si el ' +
      'reporte al que pertenece sigue en estado `pendiente` o `en_revision`.',
  })
  @ApiResponse({
    status: 204,
    description: 'Evidencia eliminada; sin cuerpo',
  })
  @ApiResponse({
    status: 400,
    description: 'El ID enviado no es un número válido', // <-- Mitigación #19
  })
  @ApiResponse({
    status: 403,
    description: 'El reporte ya fue aprobado o rechazado y no se puede modificar',
  })
  @ApiResponse({
    status: 404,
    description: 'No existe la evidencia o no pertenece al usuario',
  })
  remove(@Req() req: UserRequest, @Param('id', ParseIntPipe) id: number) {
    return this.reports.removeEvidence(req.userId, id);
  }
}