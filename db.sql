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

-- BEGIN SYSTEM LOGS V1
-- Explicit migration; application startup never executes this file.
BEGIN;
SELECT pg_advisory_xact_lock(734251, 10);
CREATE TABLE IF NOT EXISTS system_log_schema(version integer PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS system_log_catalog(action text PRIMARY KEY,label text NOT NULL,entity text NOT NULL,sensitivity text NOT NULL CHECK(sensitivity IN ('normal','sensible')),metadata_keys jsonb NOT NULL,version integer NOT NULL);
INSERT INTO system_log_catalog(action,label,entity,sensitivity,metadata_keys,version)
SELECT key,value->>'label',value->>'entity',value->>'sensitivity',value->'metadata',1
FROM jsonb_each($catalog${"AUTH_REGISTER":{"label":"Registro de cuenta","entity":"auth","sensitivity":"normal","metadata":["provider","reason_code","original_date","date_uncertain"]},"AUTH_LOGIN":{"label":"Inicio de sesión","entity":"auth","sensitivity":"normal","metadata":["provider","reason_code","original_date","date_uncertain"]},"AUTH_LOGOUT":{"label":"Cierre de sesión","entity":"auth","sensitivity":"normal","metadata":["provider","reason_code","original_date","date_uncertain"]},"PASSWORD_CHANGE":{"label":"Cambio de contraseña","entity":"user","sensitivity":"sensible","metadata":["reason_code","original_date","date_uncertain"]},"PASSWORD_RESET":{"label":"Restablecimiento de contraseña","entity":"user","sensitivity":"sensible","metadata":["reason_code","original_date","date_uncertain"]},"PROFILE_UPDATE":{"label":"Actualización de perfil","entity":"user","sensitivity":"normal","metadata":["fields","original_date","date_uncertain"]},"USER_CREATE":{"label":"Alta de usuario","entity":"user","sensitivity":"normal","metadata":["fields","role","active","original_date","date_uncertain"]},"USER_UPDATE":{"label":"Actualización de usuario","entity":"user","sensitivity":"normal","metadata":["fields","role","active","original_date","date_uncertain"]},"USER_ACCESS_CHANGE":{"label":"Cambio de acceso","entity":"user","sensitivity":"sensible","metadata":["fields","role","active","original_date","date_uncertain"]},"SOURCE_CREATE":{"label":"Alta de fuente","entity":"source","sensitivity":"normal","metadata":["fields","original_date","date_uncertain"]},"SOURCE_UPDATE":{"label":"Actualización de fuente","entity":"source","sensitivity":"normal","metadata":["fields","original_date","date_uncertain"]},"TOPIC_CREATE":{"label":"Alta de tema","entity":"topic","sensitivity":"normal","metadata":["fields","selected","original_date","date_uncertain"]},"TOPIC_UPDATE":{"label":"Actualización de tema","entity":"topic","sensitivity":"normal","metadata":["fields","selected","original_date","date_uncertain"]},"TOPIC_SUBSCRIPTION_CHANGE":{"label":"Cambio de temas de interés","entity":"topic","sensitivity":"normal","metadata":["fields","selected","original_date","date_uncertain"]},"NEWS_CREATE":{"label":"Alta de noticia","entity":"news","sensitivity":"normal","metadata":["version","fields","interaction","selected","original_date","date_uncertain"]},"NEWS_EDIT":{"label":"Corrección de noticia","entity":"news","sensitivity":"normal","metadata":["version","fields","interaction","selected","original_date","date_uncertain"]},"NEWS_SUBMIT":{"label":"Envío a revisión","entity":"news","sensitivity":"normal","metadata":["version","fields","interaction","selected","original_date","date_uncertain"]},"NEWS_PUBLISH":{"label":"Publicación de noticia","entity":"news","sensitivity":"sensible","metadata":["version","fields","interaction","selected","original_date","date_uncertain"]},"NEWS_WITHDRAW":{"label":"Retiro de noticia","entity":"news","sensitivity":"sensible","metadata":["version","fields","interaction","selected","original_date","date_uncertain"]},"NEWS_REOPEN":{"label":"Reapertura de noticia","entity":"news","sensitivity":"normal","metadata":["version","fields","interaction","selected","original_date","date_uncertain"]},"NEWS_VIEW":{"label":"Consulta de noticia","entity":"news","sensitivity":"normal","metadata":["version","fields","interaction","selected","original_date","date_uncertain"]},"NEWS_INTERACTION":{"label":"Interacción con noticia","entity":"news","sensitivity":"normal","metadata":["version","fields","interaction","selected","original_date","date_uncertain"]},"REPORT_CREATE":{"label":"Reporte de fuente","entity":"report","sensitivity":"normal","metadata":["state","original_date","date_uncertain"]},"REPORT_RESOLVE":{"label":"Resolución de reporte","entity":"report","sensitivity":"sensible","metadata":["state","original_date","date_uncertain"]},"PREFERENCES_UPDATE":{"label":"Cambio de preferencias","entity":"user","sensitivity":"normal","metadata":["fields","original_date","date_uncertain"]},"ANALYSIS_RUN":{"label":"Análisis de información","entity":"analysis","sensitivity":"normal","metadata":["news_id","model_id","cached","reason_code","original_date","date_uncertain"]},"SCRAPING_RUN":{"label":"Recopilación de publicaciones","entity":"scraping","sensitivity":"normal","metadata":["count","provider","reason_code","original_date","date_uncertain"]},"TRAINING_RUN":{"label":"Entrenamiento de modelo","entity":"model","sensitivity":"sensible","metadata":["model_id","reason_code","original_date","date_uncertain"]},"LINK_MONITOR_RUN":{"label":"Revisión de enlaces","entity":"link_monitor","sensitivity":"normal","metadata":["count","reason_code","original_date","date_uncertain"]},"ANNOUNCEMENT_CREATE":{"label":"Alta de aviso","entity":"announcement","sensitivity":"normal","metadata":["fields","count","original_date","date_uncertain"]},"ANNOUNCEMENT_EDIT":{"label":"Edición de aviso","entity":"announcement","sensitivity":"normal","metadata":["fields","count","original_date","date_uncertain"]},"ANNOUNCEMENT_SCHEDULE":{"label":"Programación de aviso","entity":"announcement","sensitivity":"normal","metadata":["fields","count","original_date","date_uncertain"]},"ANNOUNCEMENT_PUBLISH":{"label":"Publicación de aviso","entity":"announcement","sensitivity":"sensible","metadata":["fields","count","original_date","date_uncertain"]},"ANNOUNCEMENT_WITHDRAW":{"label":"Retiro de aviso","entity":"announcement","sensitivity":"sensible","metadata":["fields","count","original_date","date_uncertain"]},"NOTIFICATION_READ":{"label":"Lectura de aviso","entity":"notification","sensitivity":"normal","metadata":["source","original_date","date_uncertain"]},"NOTIFICATION_DELETE":{"label":"Eliminación de notificación","entity":"notification","sensitivity":"normal","metadata":["source","original_date","date_uncertain"]},"DELIVERY_RUN":{"label":"Procesamiento de entregas","entity":"delivery","sensitivity":"normal","metadata":["count","failed_count","transport_status","reason_code","original_date","date_uncertain"]},"LOG_EXPORT":{"label":"Exportación de Logs","entity":"log","sensitivity":"sensible","metadata":["count","log_id","original_date","date_uncertain"]},"LOG_DETAIL_VIEW":{"label":"Consulta de detalle de Logs","entity":"log","sensitivity":"sensible","metadata":["count","log_id","original_date","date_uncertain"]}}$catalog$::jsonb)
ON CONFLICT(action) DO NOTHING;
CREATE TABLE IF NOT EXISTS system_logs(
 id bigserial PRIMARY KEY,event_key uuid NOT NULL UNIQUE,event_fingerprint text NOT NULL,
 occurred_at timestamptz,recorded_at timestamptz NOT NULL DEFAULT now(),
 user_id integer REFERENCES usuarios(id) ON DELETE SET NULL,
 actor_type text NOT NULL CHECK(actor_type IN ('user','system','anonymous')),actor_role text CHECK(actor_role IN ('admin','usuario')),
 action text NOT NULL REFERENCES system_log_catalog(action),entity text NOT NULL,entity_id varchar(128),
 service text NOT NULL CHECK(service IN ('auth','news','ml','notifications','link-monitor','gateway')),
 request_id uuid NOT NULL,outcome text NOT NULL CHECK(outcome IN ('success','failure','denied','started')),
 sensitivity text NOT NULL CHECK(sensitivity IN ('normal','sensible')),catalog_version integer NOT NULL,
 description varchar(1000) NOT NULL CHECK(length(trim(description))>0),ip_address inet,user_agent varchar(512),
 metadata jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=16384),
 origin text NOT NULL CHECK(origin IN ('live','imported')),source_reference varchar(200),
 CHECK(occurred_at IS NOT NULL OR origin='imported'),
 CHECK(actor_type='user' OR (user_id IS NULL AND actor_role IS NULL))
);
CREATE INDEX IF NOT EXISTS system_logs_date ON system_logs((COALESCE(occurred_at,recorded_at)) DESC,id DESC);
CREATE INDEX IF NOT EXISTS system_logs_actor_date ON system_logs(user_id,(COALESCE(occurred_at,recorded_at)) DESC);
CREATE INDEX IF NOT EXISTS system_logs_action_date ON system_logs(action,(COALESCE(occurred_at,recorded_at)) DESC);
CREATE INDEX IF NOT EXISTS system_logs_entity ON system_logs(entity,entity_id);
CREATE INDEX IF NOT EXISTS system_logs_service_date ON system_logs(service,(COALESCE(occurred_at,recorded_at)) DESC);
CREATE OR REPLACE FUNCTION record_system_log(e jsonb) RETURNS bigint LANGUAGE plpgsql AS $function$
DECLARE rule system_log_catalog%ROWTYPE; existing system_logs%ROWTYPE; result bigint;
 fingerprint text; k text; v jsonb; item jsonb; resolved_user integer;
 required_keys text[]:=ARRAY['event_key','occurred_at','user_id','actor_type','actor_role','action','entity','entity_id','service','request_id','outcome','description','ip_address','user_agent','metadata','origin','source_reference'];
BEGIN
 IF jsonb_typeof(e) IS DISTINCT FROM 'object' OR NOT (e ?& required_keys) OR EXISTS(SELECT 1 FROM jsonb_object_keys(e) x WHERE NOT x=ANY(required_keys)) THEN RAISE EXCEPTION 'Invalid audit fields' USING ERRCODE='22023'; END IF;
 FOR k IN SELECT unnest(ARRAY['event_key','actor_type','action','entity','service','request_id','outcome','description','origin']) LOOP
  IF jsonb_typeof(e->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid audit field type'; END IF;
 END LOOP;
 FOR k IN SELECT unnest(ARRAY['occurred_at','actor_role','entity_id','ip_address','user_agent','source_reference']) LOOP
  IF jsonb_typeof(e->k) NOT IN ('string','null') THEN RAISE EXCEPTION 'Invalid audit nullable field type'; END IF;
 END LOOP;
 IF position('/' IN coalesce(e->>'ip_address',''))>0 THEN RAISE EXCEPTION 'Invalid audit IP'; END IF;
 SELECT * INTO rule FROM system_log_catalog WHERE action=e->>'action';
 IF NOT FOUND OR rule.entity IS DISTINCT FROM e->>'entity' THEN RAISE EXCEPTION 'Invalid audit action/entity' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(e->'metadata') IS DISTINCT FROM 'object' OR octet_length((e->'metadata')::text)>16384 THEN RAISE EXCEPTION 'Invalid audit metadata' USING ERRCODE='22023'; END IF;
 FOR k,v IN SELECT * FROM jsonb_each(e->'metadata') LOOP
  IF NOT rule.metadata_keys ? k THEN RAISE EXCEPTION 'Invalid audit metadata key' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(v)='array' THEN
   IF jsonb_array_length(v)>100 THEN RAISE EXCEPTION 'Invalid audit metadata array'; END IF;
   FOR item IN SELECT * FROM jsonb_array_elements(v) LOOP
    IF jsonb_typeof(item)<>'string' OR length(item#>>'{}')>128 THEN RAISE EXCEPTION 'Invalid audit metadata item'; END IF;
   END LOOP;
  ELSIF jsonb_typeof(v) NOT IN ('string','number','boolean','null') OR (jsonb_typeof(v)='string' AND length(v#>>'{}')>512) THEN RAISE EXCEPTION 'Invalid audit metadata value'; END IF;
 END LOOP;
 IF e->>'actor_type'='user' THEN
  IF NOT (e->>'origin'='imported' AND e->'user_id'='null'::jsonb) AND (jsonb_typeof(e->'user_id') IS DISTINCT FROM 'number' OR (e->>'user_id')::numeric<1 OR (e->>'user_id')::numeric<>trunc((e->>'user_id')::numeric)) THEN RAISE EXCEPTION 'Invalid audit actor'; END IF;
 ELSIF e->'user_id'<>'null'::jsonb OR e->'actor_role'<>'null'::jsonb THEN RAISE EXCEPTION 'Invalid audit actor'; END IF;
 IF e->>'occurred_at' IS NOT NULL AND e->>'occurred_at' !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$' THEN RAISE EXCEPTION 'Invalid audit timestamp'; END IF;
 fingerprint:=encode(sha256(convert_to(e::text,'UTF8')),'hex');
 SELECT * INTO existing FROM system_logs WHERE event_key=(e->>'event_key')::uuid;
 IF FOUND THEN
  IF existing.event_fingerprint<>fingerprint THEN RAISE EXCEPTION 'Audit event conflict' USING ERRCODE='23505'; END IF;
  RETURN existing.id;
 END IF;
 resolved_user:=(e->>'user_id')::integer;
 -- A monitor completion retains its initiating user even if that account was deleted.
 -- Only a persisted run and its matching start event can authorize the missing FK.
 IF resolved_user IS NOT NULL AND NOT EXISTS(SELECT 1 FROM usuarios WHERE id=resolved_user)
    AND e->>'action'='LINK_MONITOR_RUN' AND e->>'service'='link-monitor'
    AND e->>'actor_type'='user' AND e->>'origin'='live'
    AND e->>'outcome' IN ('success','failure') AND to_regclass('link_monitor_runs') IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM link_monitor_runs r JOIN system_logs l ON l.request_id=r.id
    WHERE r.id=(e->>'request_id')::uuid AND r.id::text=e->>'entity_id' AND r.requested_by=resolved_user
      AND l.action='LINK_MONITOR_RUN' AND l.service='link-monitor' AND l.outcome='started'
      AND l.origin='live' AND l.actor_type='user' AND l.user_id IS NULL
      AND l.actor_role IS NOT DISTINCT FROM e->>'actor_role') THEN resolved_user:=NULL; END IF;
 END IF;
 INSERT INTO system_logs(event_key,event_fingerprint,occurred_at,user_id,actor_type,actor_role,action,entity,entity_id,service,request_id,outcome,sensitivity,catalog_version,description,ip_address,user_agent,metadata,origin,source_reference)
 VALUES((e->>'event_key')::uuid,fingerprint,(e->>'occurred_at')::timestamptz,resolved_user,e->>'actor_type',e->>'actor_role',e->>'action',e->>'entity',e->>'entity_id',e->>'service',(e->>'request_id')::uuid,e->>'outcome',
 CASE WHEN e->>'action'='AUTH_LOGIN' AND e->>'outcome' IN ('failure','denied') THEN 'sensible' ELSE rule.sensitivity END,rule.version,e->>'description',(e->>'ip_address')::inet,e->>'user_agent',e->'metadata',e->>'origin',e->>'source_reference')
 ON CONFLICT(event_key) DO NOTHING RETURNING id INTO result;
 IF result IS NULL THEN
  SELECT * INTO existing FROM system_logs WHERE event_key=(e->>'event_key')::uuid;
  IF existing.event_fingerprint<>fingerprint THEN RAISE EXCEPTION 'Audit event conflict' USING ERRCODE='23505'; END IF;
  result:=existing.id;
 END IF;
 RETURN result;
END;
$function$;
INSERT INTO system_log_schema(version) VALUES(1) ON CONFLICT DO NOTHING;
COMMIT;
-- END SYSTEM LOGS V1
