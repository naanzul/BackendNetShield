import { Inject, Injectable } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { SQL_APPROVED, SQL_PENDING, SQL_REJECTED } from './report.status';

/**
 * Servicio de estadisticas de reportes.
 *
 * Agrega los reportes por categoria, estado, mes, sitio y pais. Todos
 * los metodos aceptan filtros opcionales por fecha, categoria y pais;
 * los filtros se combinan con AND.
 */
@Injectable()
export class AdminStatisticsService {
  constructor(
    @Inject('DB_POOL')
    private readonly pool: Pool,
  ) {}

  /**
   * Construye las condiciones WHERE comunes a varias consultas.
   *
   * Las consultas usan los alias `r` (reporte) y `u` (usuario). El
   * filtro por pais se aplica sobre `u.pais`.
   *
   * @param from - Fecha inicial opcional (AAAA-MM-DD).
   * @param to - Fecha final opcional (AAAA-MM-DD).
   * @param country - Pais opcional del usuario que reporto.
   * @returns Las condiciones y los parametros para la consulta.
   */
  private filters(from?: string, to?: string, country?: string) {
    const conditions: string[] = [];
    const params: string[] = [];
    if (from) {
      conditions.push('r.fecha_reporte >= ?');
      params.push(from);
    }
    if (to) {
      conditions.push('r.fecha_reporte < DATE_ADD(?, INTERVAL 1 DAY)');
      params.push(to);
    }
    if (country) {
      conditions.push('u.pais = ?');
      params.push(country);
    }
    return { conditions, params };
  }

  /**
   * Total de reportes agrupados por categoria.
   *
   * Incluye las categorias sin reportes (total 0) para que la grafica
   * muestre el catalogo completo.
   *
   * @param from - Fecha inicial opcional.
   * @param to - Fecha final opcional.
   * @param country - Pais opcional.
   * @returns Lista de categorias con su total.
   */
  async byCategory(from?: string, to?: string, country?: string) {
    const { conditions, params } = this.filters(from, to, country);
    const extra = conditions.map((c) => ` AND ${c}`).join('');

    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT c.nombre AS name, COUNT(r.id_reporte) AS total
       FROM subcategoria c
       LEFT JOIN (reporte r INNER JOIN usuario u ON r.id_usuario = u.id_usuario)
         ON r.id_subcategoria = c.id_subcategoria${extra}
       GROUP BY c.id_subcategoria, c.nombre
       ORDER BY total DESC, c.nombre`,
      params,
    );
    return rows.map((row) => ({ name: String(row.name), total: Number(row.total) }));
  }

  /**
   * Total de reportes agrupados por estado.
   *
   * @param from - Fecha inicial opcional.
   * @param to - Fecha final opcional.
   * @param country - Pais opcional.
   * @returns Lista con pendientes, aprobados y desaprobados.
   */
  async byStatus(from?: string, to?: string, country?: string) {
    const { conditions, params } = this.filters(from, to, country);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT
         COALESCE(SUM(CASE WHEN ${SQL_PENDING} THEN 1 ELSE 0 END), 0) AS pending,
         COALESCE(SUM(CASE WHEN ${SQL_APPROVED} THEN 1 ELSE 0 END), 0) AS approved,
         COALESCE(SUM(CASE WHEN ${SQL_REJECTED} THEN 1 ELSE 0 END), 0) AS rejected
       FROM reporte r
       INNER JOIN usuario u ON r.id_usuario = u.id_usuario
       INNER JOIN estado_reporte e ON r.id_estado_reporte = e.id_estado_reporte
       ${where}`,
      params,
    );

    const row = rows[0];
    return [
      { key: 'pending', name: 'Pendientes', total: Number(row.pending) },
      { key: 'approved', name: 'Aprobados', total: Number(row.approved) },
      { key: 'rejected', name: 'Desaprobados', total: Number(row.rejected) },
    ];
  }

  /**
   * Total de reportes agrupados por mes.
   *
   * @param from - Fecha inicial opcional.
   * @param to - Fecha final opcional.
   * @param country - Pais opcional.
   * @returns Lista de meses (AAAA-MM) con su total.
   */
  async trends(from?: string, to?: string, country?: string) {
    const { conditions, params } = this.filters(from, to, country);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT DATE_FORMAT(r.fecha_reporte, '%Y-%m') AS month, COUNT(*) AS total
       FROM reporte r
       INNER JOIN usuario u ON r.id_usuario = u.id_usuario
       ${where}
       GROUP BY DATE_FORMAT(r.fecha_reporte, '%Y-%m')
       ORDER BY month`,
      params,
    );
    return rows.map((row) => ({ month: String(row.month), total: Number(row.total) }));
  }

  /**
   * Sitios con mas reportes.
   *
   * @param from - Fecha inicial opcional.
   * @param to - Fecha final opcional.
   * @param category - Categoria opcional: deja solo los de esa categoria.
   * @param country - Pais opcional.
   * @returns Lista de hasta 50 sitios con totales y usuarios unicos.
   */
  async bySite(from?: string, to?: string, category?: string, country?: string) {
    const { conditions, params } = this.filters(from, to, country);
    if (category) {
      conditions.push('c.nombre = ?');
      params.push(category);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT s.url AS url,
              COUNT(r.id_reporte) AS total,
              COUNT(DISTINCT r.id_usuario) AS users,
              GROUP_CONCAT(DISTINCT c.nombre ORDER BY c.nombre SEPARATOR ', ') AS categories,
              DATE_FORMAT(MAX(r.fecha_reporte), '%Y-%m-%d') AS lastReport
       FROM reporte r
       INNER JOIN sitio s ON r.id_sitio = s.id_sitio
       INNER JOIN subcategoria c ON r.id_subcategoria = c.id_subcategoria
       INNER JOIN usuario u ON r.id_usuario = u.id_usuario
       ${where}
       GROUP BY s.id_sitio, s.url
       ORDER BY total DESC, lastReport DESC
       LIMIT 50`,
      params,
    );

    return rows.map((row) => ({
      url: String(row.url),
      total: Number(row.total),
      users: Number(row.users),
      categories: String(row.categories ?? ''),
      lastReport: String(row.lastReport),
    }));
  }

  /**
   * Total de reportes agrupados por pais del usuario que reporto.
   *
   * Los usuarios sin pais se agrupan bajo la etiqueta "Sin pais". El
   * orden es descendente por total.
   *
   * @param from - Fecha inicial opcional.
   * @param to - Fecha final opcional.
   * @param category - Categoria opcional.
   * @param country - Pais opcional (si se filtra, solo queda ese).
   * @returns Lista de paises con su total.
   */
  async byCountry(
    from?: string,
    to?: string,
    category?: string,
    country?: string,
  ) {
    const { conditions, params } = this.filters(from, to, country);
    if (category) {
      conditions.push('c.nombre = ?');
      params.push(category);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT COALESCE(u.pais, 'Sin pais') AS country, COUNT(r.id_reporte) AS total
       FROM reporte r
       INNER JOIN usuario u ON r.id_usuario = u.id_usuario
       INNER JOIN subcategoria c ON r.id_subcategoria = c.id_subcategoria
       ${where}
       GROUP BY u.pais
       ORDER BY total DESC, country`,
      params,
    );

    return rows.map((row) => ({
      country: String(row.country),
      total: Number(row.total),
    }));
  }

  /**
   * Lista de paises distintos registrados en la base de datos.
   *
   * @returns Lista de paises ordenada alfabeticamente.
   */
  async countries() {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT DISTINCT pais FROM usuario WHERE pais IS NOT NULL ORDER BY pais',
    );
    return rows.map((row) => String(row.pais));
  }

  /**
   * Resumen completo de estadisticas.
   *
   * Ejecuta todas las agregaciones en paralelo y las devuelve juntas.
   *
   * @param from - Fecha inicial opcional.
   * @param to - Fecha final opcional.
   * @param category - Categoria opcional.
   * @param country - Pais opcional.
   * @returns Objeto con totales y desgloses.
   */
  async overview(
    from?: string,
    to?: string,
    category?: string,
    country?: string,
  ) {
    const [byCategory, byStatus, byMonth, bySite, byCountry, countries] =
      await Promise.all([
        this.byCategory(from, to, country),
        this.byStatus(from, to, country),
        this.trends(from, to, country),
        this.bySite(from, to, category, country),
        this.byCountry(from, to, category, country),
        this.countries(),
      ]);

    return {
      total: byStatus.reduce((sum, s) => sum + s.total, 0),
      byCategory,
      byStatus,
      byMonth,
      bySite,
      byCountry,
      countries,
    };
  }
}