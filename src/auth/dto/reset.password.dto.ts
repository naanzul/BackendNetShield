import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, MaxLength, MinLength } from 'class-validator';

/**
 * Restablecimiento de contrasena con un codigo de recuperacion.
 *
 * El codigo es de 6 digitos, vale 15 minutos y es de un solo uso. El
 * servicio lo compara con el hash guardado en `token_recuperacion`.
 */
export class ResetPasswordDto {
  /** Correo del usuario que solicito la recuperacion. */
  @ApiProperty({
    description: 'Correo electronico con el que el usuario se registro',
    example: 'ximena@example.com',
    format: 'email',
    maxLength: 150,
  })
  @IsEmail()
  @MaxLength(150)
  email!: string;

  /** Codigo de 6 digitos que llego por email o consola. */
  @ApiProperty({
    description: 'Codigo de 6 digitos recibido por email (o impreso en consola)',
    example: '483921',
    minLength: 6,
    maxLength: 6,
  })
  @IsString()
  @Length(6, 6)
  code!: string;

  /** Nueva contrasena que reemplazara a la actual. */
  @ApiProperty({
    description: 'Nueva contrasena del usuario',
    example: 'NuevaClave123',
    minLength: 8,
    maxLength: 72,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;
}