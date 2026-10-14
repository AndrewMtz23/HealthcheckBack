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
