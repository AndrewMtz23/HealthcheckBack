-- Definir ENUMs
CREATE TYPE rol_enum AS ENUM ('admin', 'usuario');
CREATE TYPE frecuencia_enum AS ENUM ('diaria', 'semanal', 'inmediata');
CREATE TYPE resultado_enum AS ENUM ('verdadera', 'falsa', 'dudosa');
CREATE TYPE estado_enum AS ENUM ('pendiente', 'revisado', 'desestimado');
CREATE TYPE interaccion_enum AS ENUM ('marcar_confiable', 'marcar_dudosa', 'compartir');
CREATE TYPE tipo_notificacion_enum AS ENUM ('email', 'sms');
CREATE TYPE log_tipo_enum AS ENUM ('error', 'warning', 'info', 'security');

-- Crear la tabla TEMAS primero, ya que otras tablas dependen de ella
CREATE TABLE temas (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR NOT NULL UNIQUE,
  descripcion TEXT,
  palabras_clave TEXT,
  activo BOOLEAN DEFAULT true
);

-- Crear la tabla USUARIOS
CREATE TABLE usuarios (
  id SERIAL PRIMARY KEY,
  email VARCHAR UNIQUE NOT NULL,
  nombre VARCHAR NOT NULL,
  telefono VARCHAR,
  imagen_url VARCHAR(2048),
  contrasena VARCHAR,
  rol rol_enum NOT NULL DEFAULT 'usuario',
  fecha_registro TIMESTAMP DEFAULT now(),
  ultima_conexion TIMESTAMP,
  activo BOOLEAN DEFAULT true,
  google_id VARCHAR UNIQUE
);

-- Crear otras tablas en el orden correcto
CREATE TABLE preferencias_usuario (
  id SERIAL PRIMARY KEY,
  usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
  recibir_notificaciones BOOLEAN DEFAULT true,
  frecuencia_notificaciones frecuencia_enum DEFAULT 'diaria',
  tipo_notificacion tipo_notificacion_enum DEFAULT 'email' NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP
);

CREATE TABLE preferencias_usuario_temas (
  id SERIAL PRIMARY KEY,
  usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
  tema_id INT REFERENCES temas(id) ON DELETE CASCADE,
  UNIQUE (usuario_id, tema_id)
);

CREATE TABLE fuentes (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR NOT NULL,
  url VARCHAR UNIQUE,
  confiabilidad DECIMAL(5,2) DEFAULT 0.5,
  verificada BOOLEAN DEFAULT false,
  descripcion TEXT,
  noticias_verdaderas INT DEFAULT 0,
  noticias_falsas INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP
);

CREATE TABLE noticias (
  id SERIAL PRIMARY KEY,
  titulo VARCHAR NOT NULL,
  contenido TEXT NOT NULL,
  url VARCHAR,
  fecha_publicacion TIMESTAMP,
  fuente_id INT REFERENCES fuentes(id) ON DELETE SET NULL,
  tema_id INT REFERENCES temas(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP
);

CREATE TABLE modelos_ml (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR NOT NULL,
  version VARCHAR NOT NULL,
  descripcion TEXT,
  precision DECIMAL(5,2),
  recall DECIMAL(5,2),
  f1_score DECIMAL(5,2),
  fecha_entrenamiento TIMESTAMP,
  activo BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP,
  modelo_base INT REFERENCES modelos_ml(id) ON DELETE CASCADE
);

CREATE TABLE clasificacion_noticias (
  id SERIAL PRIMARY KEY,
  noticia_id INT REFERENCES noticias(id) ON DELETE CASCADE,
  modelo_id INT REFERENCES modelos_ml(id) ON DELETE SET NULL,
  resultado resultado_enum NOT NULL,
  confianza DECIMAL(5,2),
  explicacion TEXT,
  fecha_clasificacion TIMESTAMP DEFAULT now()
);

CREATE TABLE reportes_fuente (
  id SERIAL PRIMARY KEY,
  fuente_id INT REFERENCES fuentes(id) ON DELETE CASCADE,
  usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
  motivo TEXT NOT NULL,
  estado estado_enum DEFAULT 'pendiente',
  fecha_reporte TIMESTAMP DEFAULT now(),
  fecha_revision TIMESTAMP
);

CREATE TABLE historial_consultas (
  id SERIAL PRIMARY KEY,
  usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
  noticia_id INT REFERENCES noticias(id) ON DELETE CASCADE,
  fecha_consulta TIMESTAMP DEFAULT now()
);

CREATE TABLE interacciones_noticia (
  id SERIAL PRIMARY KEY,
  usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
  noticia_id INT REFERENCES noticias(id) ON DELETE CASCADE,
  tipo_interaccion interaccion_enum NOT NULL,
  fecha_interaccion TIMESTAMP DEFAULT now()
);

CREATE TABLE notificaciones (
  id SERIAL PRIMARY KEY,
  usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
  noticia_id INT REFERENCES noticias(id) ON DELETE CASCADE,
  titulo VARCHAR NOT NULL,
  mensaje TEXT NOT NULL,
  tipo tipo_notificacion_enum NOT NULL,
  enviada BOOLEAN DEFAULT false,
  fecha_creacion TIMESTAMP DEFAULT now(),
  fecha_envio TIMESTAMP
);

CREATE TABLE keywords (
  id SERIAL PRIMARY KEY,
  palabra VARCHAR UNIQUE NOT NULL,
  relevancia DECIMAL(5,2)
);

CREATE TABLE noticias_keywords (
  id SERIAL PRIMARY KEY,
  noticia_id INT REFERENCES noticias(id) ON DELETE CASCADE,
  keyword_id INT REFERENCES keywords(id) ON DELETE CASCADE
);

-- Editorial schema baseline
-- Explicit, transactional upgrade. Never executed by application startup.
BEGIN;
SELECT pg_advisory_xact_lock(734251, 5);
CREATE TABLE IF NOT EXISTS news_editorial_schema(version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM news_editorial_schema WHERE version=1) THEN
 ALTER TABLE noticias ADD COLUMN editorial_state TEXT NOT NULL DEFAULT 'draft' CHECK(editorial_state IN ('draft','in_review','published','withdrawn')),
 ADD COLUMN editorial_origin TEXT NOT NULL DEFAULT 'imported' CHECK(editorial_origin IN ('legacy','manual','imported')),
 ADD COLUMN editorial_version INTEGER NOT NULL DEFAULT 1 CHECK(editorial_version>0),
 ADD COLUMN content_version INTEGER NOT NULL DEFAULT 1 CHECK(content_version>0),
 ADD COLUMN editorial_published_at TIMESTAMPTZ,
 ADD COLUMN editorial_reviewed_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
 ADD COLUMN editorial_reviewed_at TIMESTAMPTZ,
 ADD COLUMN editorial_reviewed_version INTEGER;
 UPDATE noticias SET editorial_origin='legacy',editorial_state=CASE WHEN nullif(trim(url),'') IS NOT NULL AND fecha_publicacion IS NOT NULL THEN 'published' ELSE 'draft' END;
 ALTER TABLE noticias ADD COLUMN IF NOT EXISTS fecha_analisis TIMESTAMP;
 ALTER TABLE clasificacion_noticias ADD COLUMN content_version INTEGER CHECK(content_version>0);
 UPDATE clasificacion_noticias SET content_version=1;
 IF to_regclass('notification_delivery_items') IS NOT NULL THEN
  ALTER TABLE notification_delivery_items ADD COLUMN IF NOT EXISTS content_version INTEGER NOT NULL DEFAULT 1 CHECK(content_version>0);
 END IF;
 CREATE TABLE news_editorial_events(
  id BIGSERIAL PRIMARY KEY, noticia_id INTEGER NOT NULL REFERENCES noticias(id) ON DELETE RESTRICT,
  actor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL, actor_role TEXT NOT NULL,
  action TEXT NOT NULL, reason TEXT NOT NULL, version INTEGER NOT NULL,
  before_data JSONB, after_data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 );
 CREATE INDEX news_editorial_events_news ON news_editorial_events(noticia_id,id DESC);
 CREATE INDEX news_editorial_visibility ON noticias(editorial_state,editorial_published_at DESC,id DESC);
 ALTER TABLE reportes_fuente ADD COLUMN resolution_note TEXT, ADD COLUMN resolved_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
 CREATE TABLE source_report_events(id BIGSERIAL PRIMARY KEY,report_id INTEGER NOT NULL REFERENCES reportes_fuente(id) ON DELETE RESTRICT,actor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,state TEXT NOT NULL,note TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
 INSERT INTO news_editorial_schema(version) VALUES(1);
END IF;
END $$;
CREATE OR REPLACE FUNCTION news_is_public(n noticias) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
 SELECT n.editorial_state='published' AND (n.editorial_origin<>'legacy' OR (nullif(trim(n.url),'') IS NOT NULL AND n.fecha_publicacion IS NOT NULL))
$$;
-- Defend against edits by importers as well as by the administrative API.
CREATE OR REPLACE FUNCTION news_editorial_on_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.titulo,NEW.contenido) IS DISTINCT FROM (OLD.titulo,OLD.contenido) THEN
  NEW.content_version:=OLD.content_version+1;
 END IF;
 IF (NEW.titulo,NEW.contenido,NEW.fuente_id,NEW.url) IS DISTINCT FROM (OLD.titulo,OLD.contenido,OLD.fuente_id,OLD.url) THEN
  IF OLD.editorial_state IN ('published','in_review') THEN NEW.editorial_state:='draft'; END IF;
  NEW.editorial_reviewed_by:=NULL; NEW.editorial_reviewed_at:=NULL; NEW.editorial_reviewed_version:=NULL;
 END IF;
 IF (NEW.titulo,NEW.contenido,NEW.fuente_id,NEW.url,NEW.tema_id,NEW.fecha_publicacion,NEW.editorial_state) IS DISTINCT FROM
    (OLD.titulo,OLD.contenido,OLD.fuente_id,OLD.url,OLD.tema_id,OLD.fecha_publicacion,OLD.editorial_state) THEN
  NEW.editorial_version:=OLD.editorial_version+1;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS news_editorial_version ON noticias;
CREATE TRIGGER news_editorial_version BEFORE UPDATE ON noticias FOR EACH ROW EXECUTE FUNCTION news_editorial_on_update();
COMMIT;
