-- Definir ENUMs
CREATE TYPE rol_enum AS ENUM ('admin', 'usuario');
CREATE TYPE frecuencia_enum AS ENUM ('diaria', 'semanal', 'inmediata');
CREATE TYPE resultado_enum AS ENUM ('verdadera', 'falsa', 'dudosa');
CREATE TYPE estado_enum AS ENUM ('pendiente', 'revisado', 'desestimado');
CREATE TYPE interaccion_enum AS ENUM ('marcar_confiable', 'marcar_dudosa', 'compartir');
CREATE TYPE notificacion_tipo_enum AS ENUM ('sms', 'email', 'app');
CREATE TYPE material_tipo_enum AS ENUM ('articulo', 'video', 'infografia', 'quiz');
CREATE TYPE log_tipo_enum AS ENUM ('error', 'warning', 'info', 'security');

-- Crear la tabla TEMAS primero, ya que otras tablas dependen de ella
CREATE TABLE temas (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR NOT NULL,
  descripcion TEXT,
  activo BOOLEAN DEFAULT true
);

-- Crear la tabla USUARIOS
CREATE TABLE usuarios (
  id SERIAL PRIMARY KEY,
  email VARCHAR UNIQUE NOT NULL,
  nombre VARCHAR NOT NULL,
  telefono VARCHAR,
  rol rol_enum NOT NULL DEFAULT 'usuario',
  fecha_registro TIMESTAMP DEFAULT now(),
  ultima_conexion TIMESTAMP,
  activo BOOLEAN DEFAULT true
);

-- Crear otras tablas en el orden correcto
CREATE TABLE preferencias_usuario (
  id SERIAL PRIMARY KEY,
  usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
  tema_id INT REFERENCES temas(id) ON DELETE SET NULL,
  recibir_notificaciones BOOLEAN DEFAULT true,
  frecuencia_notificaciones frecuencia_enum DEFAULT 'diaria',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP
);

CREATE TABLE fuentes (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR NOT NULL,
  url VARCHAR,
  confiabilidad DECIMAL(5,2),
  verificada BOOLEAN DEFAULT false,
  descripcion TEXT,
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
  fecha_analisis TIMESTAMP,
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
  updated_at TIMESTAMP
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
  titulo VARCHAR NOT NULL,
  mensaje TEXT NOT NULL,
  tipo notificacion_tipo_enum NOT NULL,
  enviada BOOLEAN DEFAULT false,
  leida BOOLEAN DEFAULT false,
  fecha_creacion TIMESTAMP DEFAULT now(),
  fecha_envio TIMESTAMP
);

CREATE TABLE material_educativo (
  id SERIAL PRIMARY KEY,
  titulo VARCHAR NOT NULL,
  contenido TEXT NOT NULL,
  tema_id INT REFERENCES temas(id) ON DELETE SET NULL,
  tipo material_tipo_enum NOT NULL,
  url VARCHAR,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP
);

CREATE TABLE chatbot_qa (
  id SERIAL PRIMARY KEY,
  pregunta TEXT NOT NULL,
  respuesta TEXT NOT NULL,
  tema_id INT REFERENCES temas(id) ON DELETE SET NULL,
  frecuencia INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP
);

CREATE TABLE logs_sistema (
  id SERIAL PRIMARY KEY,
  tipo log_tipo_enum NOT NULL,
  mensaje TEXT NOT NULL,
  usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
  ip VARCHAR,
  user_agent TEXT,
  fecha TIMESTAMP DEFAULT now()
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

CREATE TABLE configuracion_sistema (
  id SERIAL PRIMARY KEY,
  clave VARCHAR UNIQUE NOT NULL,
  valor TEXT NOT NULL,
  descripcion TEXT,
  updated_at TIMESTAMP
);

ALTER TABLE fuentes ADD CONSTRAINT unique_fuente_url UNIQUE (url);

ALTER TABLE usuarios ADD COLUMN contrasena VARCHAR(255);

ALTER TABLE temas ADD CONSTRAINT unique_tema_nombre UNIQUE (nombre);

