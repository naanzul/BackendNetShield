import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/**
 * Payload para activar o desactivar una cuenta.
 *
 * Una cuenta desactivada no puede iniciar sesion, pero sus datos se
 * conservan. El cambio es inmediato: el `UserGuard` y el `AdminGuard`
 * consultan el estado en cada peticion.
 */
export class UserStatusDto {
  /** Nuevo estado de la cuenta. */
  @ApiProperty({
    description: 'true para activar la cuenta, false para desactivarla',
    example: true,
  })
  @IsBoolean()
  active: boolean | undefined;
}