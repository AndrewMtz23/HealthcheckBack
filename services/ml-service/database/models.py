from datetime import datetime
from database.db import db

class Fuente(db.Model):
    __tablename__ = 'fuentes'
    
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String, nullable=False)
    url = db.Column(db.String, unique=True)
    confiabilidad = db.Column(db.Numeric(5, 2), default=0.5)
    noticias_verdaderas = db.Column(db.Integer, default=0)
    noticias_falsas = db.Column(db.Integer, default=0)
    verificada = db.Column(db.Boolean, default=False)
    descripcion = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime)

    # Relaciones
    noticias = db.relationship('Noticia', backref='fuente', lazy=True)


class Noticia(db.Model):
    __tablename__ = 'noticias'
    
    id = db.Column(db.Integer, primary_key=True)
    titulo = db.Column(db.String, nullable=False)
    contenido = db.Column(db.Text, nullable=False)
    url = db.Column(db.String)
    fecha_publicacion = db.Column(db.DateTime)
    fuente_id = db.Column(db.Integer, db.ForeignKey('fuentes.id', ondelete='SET NULL'))
    tema_id = db.Column(db.Integer, db.ForeignKey('temas.id', ondelete='SET NULL'))
    fecha_analisis = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime)

    # Relaciones
    clasificaciones = db.relationship('ClasificacionNoticia', backref='noticia', lazy=True, cascade='all, delete-orphan')
    consultas = db.relationship('HistorialConsulta', backref='noticia', lazy=True, cascade='all, delete-orphan')


class ModeloML(db.Model):
    __tablename__ = 'modelos_ml'
    
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String, nullable=False)
    version = db.Column(db.String, nullable=False)
    descripcion = db.Column(db.Text)
    precision = db.Column(db.Numeric(5, 2))
    recall = db.Column(db.Numeric(5, 2))
    f1_score = db.Column(db.Numeric(5, 2))
    fecha_entrenamiento = db.Column(db.DateTime)
    activo = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime)

    # Relaciones
    clasificaciones = db.relationship('ClasificacionNoticia', backref='modelo', lazy=True)


class ClasificacionNoticia(db.Model):
    __tablename__ = 'clasificacion_noticias'
    
    id = db.Column(db.Integer, primary_key=True)
    noticia_id = db.Column(db.Integer, db.ForeignKey('noticias.id', ondelete='CASCADE'))
    modelo_id = db.Column(db.Integer, db.ForeignKey('modelos_ml.id', ondelete='SET NULL'))
    resultado = db.Column(db.Enum('verdadera', 'falsa', 'dudosa', name='resultado_enum'), nullable=False)
    confianza = db.Column(db.Numeric(5, 2))
    explicacion = db.Column(db.Text)
    fecha_clasificacion = db.Column(db.DateTime, default=datetime.utcnow)


class Usuario(db.Model):
    __tablename__ = 'usuarios'
    
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String, unique=True, nullable=False)
    nombre = db.Column(db.String, nullable=False)
    telefono = db.Column(db.String)
    rol = db.Column(db.Enum('admin', 'usuario', name='rol_enum'), default='usuario', nullable=False)
    fecha_registro = db.Column(db.DateTime, default=datetime.utcnow)
    ultima_conexion = db.Column(db.DateTime)
    activo = db.Column(db.Boolean, default=True)
    contrasena = db.Column(db.String(255))
    
    # Relaciones
    consultas = db.relationship('HistorialConsulta', backref='usuario', lazy=True)


class HistorialConsulta(db.Model):
    __tablename__ = 'historial_consultas'
    
    id = db.Column(db.Integer, primary_key=True)
    usuario_id = db.Column(db.Integer, db.ForeignKey('usuarios.id', ondelete='CASCADE'))
    noticia_id = db.Column(db.Integer, db.ForeignKey('noticias.id', ondelete='CASCADE'))
    fecha_consulta = db.Column(db.DateTime, default=datetime.utcnow)


class Tema(db.Model):
    __tablename__ = 'temas'
    
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String, nullable=False, unique=True)
    descripcion = db.Column(db.Text)
    activo = db.Column(db.Boolean, default=True)
    palabras_clave = db.Column(db.Text) 
    
    # Relaciones
    noticias = db.relationship('Noticia', backref='tema', lazy=True)

class Keyword(db.Model):
    __tablename__ = 'keywords'
    
    id = db.Column(db.Integer, primary_key=True)
    palabra = db.Column(db.String, unique=True, nullable=False)
    relevancia = db.Column(db.Numeric(5, 2), default=1.0)

class NoticiaKeyword(db.Model):
    __tablename__ = 'noticias_keywords'
    
    id = db.Column(db.Integer, primary_key=True)
    noticia_id = db.Column(db.Integer, db.ForeignKey('noticias.id', ondelete='CASCADE'))
    keyword_id = db.Column(db.Integer, db.ForeignKey('keywords.id', ondelete='CASCADE'))