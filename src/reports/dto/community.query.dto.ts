import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Payload para buscar una URL en la comunidad.
 *
 * La URL se normaliza antes de la busqueda: se quitan protocolos,
 * `www.`, parametros de consulta y barras finales.
 */
export class SearchSiteDto {
  /** URL a buscar en la base de datos comunitaria. */
  @ApiProperty({
    description: 'URL a buscar. Se normaliza antes de comparar',
    example: 'banco-falso.com',
    maxLength: 2048,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  url!: string;
}

/**
 * Filtros opcionales para las consultas de la comunidad.
 *
 * Todos los campos son opcionales. Si no se envia ninguno, el servicio
 * devuelve los resultados completos.
 */
export class CommunityQueryDto {
  /** Filtro por categoria. */
  @ApiPropertyOptional({
    description: 'Filtra los resultados por categoria',
    example: 'Bancos',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  /** Filtro por pais del usuario que reporto. */
  @ApiPropertyOptional({
    description: 'Filtra por pais del usuario que reporto',
    example: 'Mexico',
    maxLength: 80,
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;
}