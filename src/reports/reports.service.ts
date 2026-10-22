import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from 'mysql2/promise';

import { toUserStatus } from '../admin/report.status';
import { clean, isSimilar, simplify, titleCase } from '../text.util';
import { removeFile, removeUpload, validateImage } from '../uploads';
import { CreateReportDto } from './dto/create.report.dto';
import { ReportResponseDto } from './dto/report.response.dto';

const MAX_EVIDENCE = 5;
const OPEN_STATES = ['pendiente', 'en_revision'];
const MAX_RAW_LENGTH = 2048;
const MAX_SITE_LENGTH = 500;

/**
 * "https://www.Banco-Falso.com/login?x=1"
 * -> "banco-falso.com/login"
 *
 * Se limita la longitud antes de aplicar cualquier regex y se evitan
 * las expresiones con coste polinomial (`.*$`, `\/+$`) usando
 * operaciones lineales.
 */
export function normalizeSite(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length > MAX_RAW_LENGTH) {
    throw new BadRequestException('La URL no es válida');
  }

  // Regex ancladas al inicio y sin ambigüedad: lineales
  let value = trimmed
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/^www\./, '');

  // Cortar en el primer ? o #
  const cut = value.search(/[?#]/);
  if (cut !== -1) value = value.slice(0, cut);

  // Quitar "/" finales
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end--;
  value = value.slice(0, end);

  if (
    value.length > MAX_SITE_LENGTH ||
    !value.includes('.') ||
    !/^[a-z0-9.-]+(:\d{1,5})?(\/[^\s]*)?$/.test(value)
  ) {
    throw new BadRequestException('La URL no es válida');
  }

  return value;
}

const publicPath = (path: string) =>
  '/' + String(path).replace(/\\/g, '/').replace(/^\/+/, '');

@Injectable()
export class ReportsService {
  constructor(
    @Inject('DB_POOL')
    private readonly pool: Pool,
  ) {}

  /**
   * Busca una categoría existente o crea una nueva si se eligió "Otro".
   */
  private async resolveCategory(
    conn: PoolConnection,
    dto: CreateReportDto,
  ): Promise<number> {
    const isOther = simplify(dto.subcategory) === 'otro';
    let name: string;

    if (isOther) {
      const custom = clean(dto.customSubcategory ?? '');

      if (
        custom.length < 3 ||
        custom.length > 40 ||
        !/^[\p{L}\p{N} .,&'/-]+$/u.test(custom) ||
        simplify(custom) === 'otro'
      ) {
        throw new BadRequestException(
          'Escribe un nombre de categoría válido (3 a 40 caracteres)',
        );
      }

      name = titleCase(custom);
    } else {
      name = clean(dto.subcategory);
    }

    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT id_subcategoria AS id, nombre FROM subcategoria',
    );

    const match = rows.find((row) =>
      isSimilar(String(row.nombre), name),
    );

    if (match) return Number(match.id);

    if (!isOther) {
      throw new BadRequestException('Categoría no válida');
    }

    try {
      const [created] = await conn.query<ResultSetHeader>(
        'INSERT INTO subcategoria (nombre) VALUES (?)',
        [name],
      );

      return created.insertId;
    } catch (error) {
      if ((error as { code?: string }).code !== 'ER_DUP_ENTRY') {
        throw error;
      }

      const [again] = await conn.query<RowDataPacket[]>(
        'SELECT id_subcategoria AS id FROM subcategoria WHERE nombre = ?',
        [name],
      );

      return Number(again[0].id);
    }
  }

  /**
   * Busca el ID de un estado por su nombre.
   */
  private async stateId(
    conn: Pool | PoolConnection,
    table: 'estado_reporte' | 'estado_notificacion',
    name: string,
  ): Promise<number> {
    const column =
      table === 'estado_reporte'
        ? 'id_estado_reporte'
        : 'id_estado_notificacion';

    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT ${column} AS id, nombre_estado
       FROM ${table}
       WHERE LOWER(TRIM(nombre_estado)) = LOWER(TRIM(?))
       LIMIT 1`,
      [name],
    );

    if (!rows.length) {
      throw new BadRequestException(
        `Falta el estado "${name}" en la tabla ${table}`,
      );
    }

    return Number(rows[0].id);
  }

  async create(
    userId: number,
    dto: CreateReportDto,
  ): Promise<ReportResponseDto> {
    const siteUrl = normalizeSite(dto.url);
    const conn = await this.pool.getConnection();

    try {
      await conn.beginTransaction();

      const categoryId = await this.resolveCategory(conn, dto);

      const [site] = await conn.query<ResultSetHeader>(
        `INSERT INTO sitio (url)
         VALUES (?)
         ON DUPLICATE KEY UPDATE id_sitio = LAST_INSERT_ID(id_sitio)`,
        [siteUrl],
      );

      const [dup] = await conn.query<RowDataPacket[]>(
        `SELECT 1
         FROM reporte r
         INNER JOIN estado_reporte e
           ON r.id_estado_reporte = e.id_estado_reporte
         WHERE r.id_usuario = ?
           AND r.id_sitio = ?
           AND LOWER(TRIM(e.nombre_estado))
               IN ('pendiente', 'en_revision')
         LIMIT 1`,
        [userId, site.insertId],
      );

      if (dup.length) {
        throw new ConflictException(
          'Ya reportaste este sitio y sigue en revisión',
        );
      }

      const reportStatusId = await this.stateId(
        conn,
        'estado_reporte',
        'pendiente',
      );

      const [report] = await conn.query<ResultSetHeader>(
        `INSERT INTO reporte
          (id_usuario, id_sitio, id_subcategoria, id_estado_reporte, descripcion)
         VALUES (?, ?, ?, ?, ?)`,
        [
          userId,
          site.insertId,
          categoryId,
          reportStatusId,
          clean(dto.description),
        ],
      );

      const notificationStatusId = await this.stateId(
        conn,
        'estado_notificacion',
        'pendiente',
      );

      await conn.query(
        `INSERT IGNORE INTO notificacion
          (id_reporte, id_administrador, id_estado_notificacion)
         SELECT ?, u.id_usuario, ?
         FROM usuario u
         INNER JOIN rol r ON u.id_rol = r.id_rol
         WHERE r.nombre_rol = 'admin' AND u.activo = 1`,
        [report.insertId, notificationStatusId],
      );

      await conn.commit();

      return this.findOne(userId, report.insertId);
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  private async load(
    where: string,
    params: unknown[],
  ): Promise<ReportResponseDto[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT
         r.id_reporte AS id,
         s.url AS url,
         c.nombre AS category,
         e.nombre_estado AS status,
         r.descripcion AS description,
         r.fecha_reporte AS createdAt
       FROM reporte r
       INNER JOIN sitio s ON r.id_sitio = s.id_sitio
       INNER JOIN subcategoria c ON r.id_subcategoria = c.id_subcategoria
       INNER JOIN estado_reporte e
         ON r.id_estado_reporte = e.id_estado_reporte
       ${where}
       ORDER BY r.fecha_reporte DESC, r.id_reporte DESC`,
      params,
    );

    if (!rows.length) return [];

    const [evidence] = await this.pool.query<RowDataPacket[]>(
      `SELECT id_reporte AS reportId, ruta_imagen AS path
       FROM evidencia
       WHERE id_reporte IN (?)
       ORDER BY id_evidencia`,
      [rows.map((row) => row.id)],
    );

    return rows.map((row) => ({
      id: Number(row.id),
      url: String(row.url),
      category: String(row.category),
      status: toUserStatus(String(row.status)),
      description: String(row.description),
      createdAt: new Date(row.createdAt).toISOString(),
      evidenceUrls: evidence
        .filter((ev) => ev.reportId === row.id)
        .map((ev) => publicPath(ev.path)),
    }));
  }

  findAll(userId: number) {
    return this.load('WHERE r.id_usuario = ?', [userId]);
  }

  async findOne(
    userId: number,
    id: number,
  ): Promise<ReportResponseDto> {
    const [report] = await this.load(
      'WHERE r.id_usuario = ? AND r.id_reporte = ?',
      [userId, id],
    );

    if (!report) {
      throw new NotFoundException('No existe el reporte');
    }

    return report;
  }

  /**
   * El reporte debe pertenecer al usuario y seguir en revisión.
   */
  private async ownedOpen(userId: number, id: number) {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT e.nombre_estado AS status
       FROM reporte r
       INNER JOIN estado_reporte e
         ON r.id_estado_reporte = e.id_estado_reporte
       WHERE r.id_reporte = ? AND r.id_usuario = ?`,
      [id, userId],
    );

    if (!rows.length) {
      throw new NotFoundException('No existe el reporte');
    }

    if (
      !OPEN_STATES.includes(
        String(rows[0].status).trim().toLowerCase(),
      )
    ) {
      throw new ForbiddenException(
        'Solo puedes modificar reportes que siguen en revisión',
      );
    }
  }

  /**
   * Versión transaccional de ownedOpen con bloqueo FOR UPDATE 
   * para evitar condiciones de carrera.
   */
  private async ownedOpenTx(
    conn: PoolConnection,
    userId: number,
    id: number,
  ) {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT e.nombre_estado AS status
       FROM reporte r
       INNER JOIN estado_reporte e
         ON r.id_estado_reporte = e.id_estado_reporte
       WHERE r.id_reporte = ? AND r.id_usuario = ?
       FOR UPDATE`,
      [id, userId],
    );

    if (!rows.length) {
      throw new NotFoundException('No existe el reporte');
    }

    if (
      !OPEN_STATES.includes(
        String(rows[0].status).trim().toLowerCase(),
      )
    ) {
      throw new ForbiddenException(
        'Solo puedes modificar reportes que siguen en revisión',
      );
    }
  }

  async update(userId: number, id: number, description: string) {
    await this.ownedOpen(userId, id);

    await this.pool.query(
      'UPDATE reporte SET descripcion = ? WHERE id_reporte = ?',
      [clean(description), id],
    );

    return this.findOne(userId, id);
  }

  async remove(userId: number, id: number): Promise<void> {
    await this.ownedOpen(userId, id);

    const [files] = await this.pool.query<RowDataPacket[]>(
      'SELECT ruta_imagen FROM evidencia WHERE id_reporte = ?',
      [id],
    );

    await this.pool.query(
      'DELETE FROM reporte WHERE id_reporte = ?',
      [id],
    );

    files.forEach((file) =>
      removeUpload(publicPath(file.ruta_imagen)),
    );
  }

  /**
   * Agrega una evidencia con transacción y bloqueo FOR UPDATE
   * para evitar la condición de carrera (Mitigación #15).
   */
  async addEvidence(
    userId: number,
    id: number,
    file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('Archivo inválido o faltante');
    }

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Verificamos que el reporte sea del usuario y esté abierto (bloqueado)
      await this.ownedOpenTx(conn, userId, id);

      // 2. Bloqueamos las filas de evidencia para evitar condición de carrera
      const [count] = await conn.query<RowDataPacket[]>(
        'SELECT COUNT(*) AS total FROM evidencia WHERE id_reporte = ? FOR UPDATE',
        [id],
      );

      if (Number(count[0].total) >= MAX_EVIDENCE) {
        throw new ConflictException(
          `Máximo ${MAX_EVIDENCE} evidencias por reporte`,
        );
      }

      const path = validateImage(file, 'evidence');

      await conn.query(
        'INSERT INTO evidencia (id_reporte, ruta_imagen) VALUES (?, ?)',
        [id, path],
      );

      await conn.commit();
    } catch (error) {
      await conn.rollback();
      removeFile(file.path);
      throw error;
    } finally {
      conn.release();
    }

    return this.findOne(userId, id);
  }

  async listEvidence(userId: number, id: number) {
    await this.findOne(userId, id);

    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id_evidencia AS id, ruta_imagen AS path
       FROM evidencia
       WHERE id_reporte = ?
       ORDER BY id_evidencia`,
      [id],
    );

    return rows.map((row) => ({
      id: Number(row.id),
      url: publicPath(row.path),
    }));
  }

  async removeEvidence(
    userId: number,
    evidenceId: number,
  ): Promise<void> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT
         ev.ruta_imagen AS path,
         ev.id_reporte AS reportId
       FROM evidencia ev
       INNER JOIN reporte r ON ev.id_reporte = r.id_reporte
       WHERE ev.id_evidencia = ? AND r.id_usuario = ?`,
      [evidenceId, userId],
    );

    if (!rows.length) {
      throw new NotFoundException('No existe la evidencia');
    }

    await this.ownedOpen(userId, Number(rows[0].reportId));

    await this.pool.query(
      'DELETE FROM evidencia WHERE id_evidencia = ?',
      [evidenceId],
    );

    removeUpload(publicPath(rows[0].path));
  }
}