import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { ReportsModule } from './reports/reports.module';
import { UsersModule } from './users/users.module';

/**
 * Modulo raiz de la aplicacion.
 *
 * Registra los modulos funcionales y expone el controller y service
 * base. La lista de `imports` define que modulos se cargan al arrancar
 * el servidor.
 */
@Module({
  imports: [
    // 1. MITIGACIÓN: Rate Limiting global (Fuerza Bruta - CWE-307)
    ThrottlerModule.forRoot([{
      ttl: 60000, // 60 segundos
      limit: 10,  // Máximo 10 peticiones por IP
    }]),
    
    AuthModule, 
    AdminModule, 
    ReportsModule, 
    UsersModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 2. MITIGACIÓN: Aplicar el guard de Throttler a toda la app
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}