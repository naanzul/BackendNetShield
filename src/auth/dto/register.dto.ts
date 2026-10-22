import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Datos para registrar un usuario nuevo.
 *
 * Los campos se validan con `class-validator`. El `ValidationPipe`
 * global rechaza cualquier peticion que no cumpla estas reglas, antes
 * de que llegue al controller.
 */
export class RegisterDto {
  /** Nombre completo del usuario. */
  @ApiProperty({
    description: 'Nombre completo del usuario',
    example: 'Ximena Camacho',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  /** Correo electronico unico en el sistema. */
  @ApiProperty({
    description: 'Correo electronico unico en el sistema',
    example: 'ximena@example.com',
    format: 'email',
  })
  @IsEmail()
  @MaxLength(150) // <-- Refuerzo de seguridad (límite de longitud)
  email!: string;

  /** Contrasena en claro. Se hashea antes de guardarla. */
  @ApiProperty({
    description: 'Contrasena del usuario. Se hashea antes de guardarla',
    example: 'secreto123',
    minLength: 8,
    maxLength: 72,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  /**
   * Pais del usuario. Se resuelve contra la tabla `pais` al guardar;
   * si no existe, se guarda el valor tal cual.
   */
  @ApiProperty({
    description: 'Pais del usuario. Letras, espacios, puntos, apostrofes y guiones',
    example: 'Mexico',
    maxLength: 60,
  })
  @IsString()
  @MaxLength(60) // <-- Refuerzo de seguridad (límite de longitud)
  @Matches(/^([\p{L}][ .'-]*)+$/u, { message: 'País inválido' })
  country!: string;
}