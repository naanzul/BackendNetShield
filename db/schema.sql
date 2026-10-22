-- ============================================
-- BASE DE DATOS NETSHIELD
-- Sistema de reportes de sitios fraudulentos
-- ============================================

CREATE DATABASE IF NOT EXISTS reportes_fraude
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE reportes_fraude;

-- ============================================
-- TABLAS CATÁLOGO
-- ============================================

CREATE TABLE IF NOT EXISTS rol (
   id_rol INT AUTO_INCREMENT PRIMARY KEY,
   nombre_rol VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS estado_reporte (
   id_estado_reporte INT AUTO_INCREMENT PRIMARY KEY,
   nombre_estado VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS estado_notificacion (
   id_estado_notificacion INT AUTO_INCREMENT PRIMARY KEY,
   nombre_estado VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS subcategoria (
   id_subcategoria INT AUTO_INCREMENT PRIMARY KEY,
   nombre VARCHAR(100) NOT NULL UNIQUE
);

-- ============================================
-- TABLAS PRINCIPALES
-- ============================================

CREATE TABLE IF NOT EXISTS usuario (
   id_usuario INT AUTO_INCREMENT PRIMARY KEY,
   nombre VARCHAR(100) NOT NULL,
   correo VARCHAR(150) NOT NULL UNIQUE,
   password_hash VARCHAR(255) NOT NULL,
   id_rol INT NOT NULL,
   pais VARCHAR(80) NULL,
   foto_perfil VARCHAR(500) NULL,
   fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP(),
   activo BOOLEAN DEFAULT TRUE,
   CONSTRAINT fk_usuario_rol FOREIGN KEY (id_rol) REFERENCES rol(id_rol)
);

CREATE TABLE IF NOT EXISTS sitio (
   id_sitio INT AUTO_INCREMENT PRIMARY KEY,
   url VARCHAR(500) NOT NULL UNIQUE,
   fecha_primer_reporte DATETIME DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS reporte (
   id_reporte INT AUTO_INCREMENT PRIMARY KEY,
   id_usuario INT NOT NULL,
   id_sitio INT NOT NULL,
   id_subcategoria INT NOT NULL,
   id_estado_reporte INT NOT NULL,
   descripcion TEXT NOT NULL,
   observaciones TEXT NULL,
   fecha_reporte DATETIME DEFAULT CURRENT_TIMESTAMP(),
   id_admin_revisor INT NULL,
   fecha_revision DATETIME NULL,
   CONSTRAINT fk_reporte_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario),
   CONSTRAINT fk_reporte_sitio FOREIGN KEY (id_sitio) REFERENCES sitio(id_sitio),
   CONSTRAINT fk_reporte_subcategoria FOREIGN KEY (id_subcategoria) REFERENCES subcategoria(id_subcategoria),
   CONSTRAINT fk_reporte_estado FOREIGN KEY (id_estado_reporte) REFERENCES estado_reporte(id_estado_reporte),
   CONSTRAINT fk_reporte_admin FOREIGN KEY (id_admin_revisor) REFERENCES usuario(id_usuario)
);

CREATE TABLE IF NOT EXISTS evidencia (
   id_evidencia INT AUTO_INCREMENT PRIMARY KEY,
   id_reporte INT NOT NULL,
   ruta_imagen VARCHAR(500) NOT NULL,
   fecha_subida DATETIME DEFAULT CURRENT_TIMESTAMP(),
   CONSTRAINT fk_evidencia_reporte FOREIGN KEY (id_reporte) REFERENCES reporte(id_reporte) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notificacion (
   id_notificacion INT AUTO_INCREMENT PRIMARY KEY,
   id_reporte INT NOT NULL,
   id_administrador INT NOT NULL,
   id_estado_notificacion INT NOT NULL,
   fecha_envio DATETIME DEFAULT CURRENT_TIMESTAMP(),
   CONSTRAINT fk_notificacion_reporte FOREIGN KEY (id_reporte) REFERENCES reporte(id_reporte) ON DELETE CASCADE,
   CONSTRAINT fk_notificacion_administrador FOREIGN KEY (id_administrador) REFERENCES usuario(id_usuario),
   CONSTRAINT fk_notificacion_estado FOREIGN KEY (id_estado_notificacion) REFERENCES estado_notificacion(id_estado_notificacion),
   UNIQUE (id_reporte, id_administrador)
);

-- ============================================
-- TABLAS DE SEGURIDAD
-- ============================================

CREATE TABLE IF NOT EXISTS codigo_invitacion (
   id_codigo INT AUTO_INCREMENT PRIMARY KEY,
   codigo_hash CHAR(64) NOT NULL UNIQUE,
   id_admin_creador INT NULL,
   fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP(),
   fecha_expiracion DATETIME NOT NULL,
   id_usuario_uso INT NULL,
   fecha_uso DATETIME NULL,
   CONSTRAINT fk_codigo_admin_creador FOREIGN KEY (id_admin_creador) REFERENCES usuario(id_usuario) ON DELETE SET NULL,
   CONSTRAINT fk_codigo_usuario_uso FOREIGN KEY (id_usuario_uso) REFERENCES usuario(id_usuario) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS token_recuperacion (
   id_token INT AUTO_INCREMENT PRIMARY KEY,
   id_usuario INT NOT NULL,
   codigo_hash CHAR(64) NOT NULL,
   fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP(),
   fecha_expiracion DATETIME NOT NULL,
   usado BOOLEAN DEFAULT FALSE,
   CONSTRAINT fk_token_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE,
   INDEX idx_codigo (codigo_hash),
   INDEX idx_usuario (id_usuario)
);

-- Tabla para Revocación de Refresh Tokens (Mitigación de Seguridad #12)
CREATE TABLE IF NOT EXISTS refresh_token (
   id_token INT AUTO_INCREMENT PRIMARY KEY,
   id_usuario INT NOT NULL,
   token_hash CHAR(64) NOT NULL UNIQUE,
   fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
   fecha_expiracion DATETIME NOT NULL,
   revocado BOOLEAN DEFAULT FALSE,
   CONSTRAINT fk_refresh_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
);

-- ============================================
-- DATOS INICIALES (CATÁLOGOS)
-- ============================================

INSERT IGNORE INTO rol (id_rol, nombre_rol) VALUES
(1, 'usuario'),
(2, 'admin');

INSERT IGNORE INTO estado_reporte (id_estado_reporte, nombre_estado) VALUES
(1, 'pendiente'),
(2, 'en_revision'),
(3, 'validado'),
(4, 'rechazado');

INSERT IGNORE INTO estado_notificacion (id_estado_notificacion, nombre_estado) VALUES
(1, 'pendiente'),
(2, 'leida');

INSERT IGNORE INTO subcategoria (id_subcategoria, nombre) VALUES
(1, 'Banco'),
(2, 'Escuela'),
(3, 'Compra en línea'),
(4, 'Otros'),
(5, 'Red social');

-- ============================================
-- ÍNDICES
-- ============================================
CREATE INDEX idx_reporte_usuario ON reporte(id_usuario);
CREATE INDEX idx_reporte_sitio ON reporte(id_sitio);
CREATE INDEX idx_evidencia_reporte ON evidencia(id_reporte);
CREATE INDEX idx_notificacion_admin ON notificacion(id_administrador);