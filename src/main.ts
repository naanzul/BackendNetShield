import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import helmet from 'helmet'; // <-- Importación para las cabeceras de seguridad
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './all-exceptions.filter'; // <-- Importación del filtro de errores

/**
 * Arranque de la aplicacion.
 */
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 1. MITIGACIÓN: Helmet (Soluciona CSP, Clickjacking, X-Powered-By, MIME-Sniffing)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"], // Necesario para Swagger UI
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.disable('x-powered-by');

  // 2. MITIGACIÓN: CORS Restringido (Soluciona CORS Misconfiguration - CWE-264)
  app.enableCors({
    origin: ['http://192.168.50.1:3001', 'http://localhost:3001'], // Solo permite el frontend
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // 3. MITIGACIÓN: Filtro de errores para no revelar stack traces (CWE-1295, CWE-550)
  app.useGlobalFilters(new AllExceptionsFilter());

  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });

  /**
   * Configuracion del documento OpenAPI.
   */
  const config = new DocumentBuilder()
    .setTitle('NetShield API')
    .setDescription(
      'API REST de NetShield para reportes de sitios sospechosos.\n\n' +
        '**Autenticacion**: la mayoria de los endpoints requieren un access ' +
        'token. Obtenlo en `POST /auth/login` o `POST /admin/auth/login` y ' +
        'pegalo en el boton Authorize.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Registro, login y refresh de usuarios')
    .addTag('AdminAuth', 'Registro y login de administradores')
    .addTag('AdminDashboard', 'Resumen del panel de administracion')
    .addTag('AdminUsers', 'Gestion de usuarios desde el panel')
    .addTag('AdminReports', 'Moderacion de reportes')
    .addTag('AdminNotifications', 'Notificaciones del administrador')
    .addTag('AdminCategories', 'CRUD de categorias')
    .addTag('AdminStatistics', 'Estadisticas de reportes')
    .addTag('AdminInvitations', 'Codigos de invitacion')
    .addTag('categories', 'Consulta publica de categorias')
    .addTag('reports', 'Reportes creados por usuarios')
    .addTag('community', 'Consulta publica de sitios reportados')
    .addTag('users', 'Perfil del usuario autenticado')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'NetShield API Docs',
  });

  await app.listen(3000, '0.0.0.0');
  console.log('API en http://localhost:3000 y en ' + lanUrls().join(', '));
  console.log('Swagger en http://localhost:3000/docs');
}

/**
 * Devuelve las URLs de la red local en las que esta disponible la API.
 */
function lanUrls(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => 'http://' + i!.address + ':3000');
}

bootstrap();