from database.db import db
from database.models import Fuente, Noticia, ModeloML, ClasificacionNoticia, HistorialConsulta
from sqlalchemy.exc import SQLAlchemyError
from datetime import datetime
from urllib.parse import urlparse
import logging

# Configuración básica de logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_or_create_source(url):
    """Verifica si la fuente existe en la BD; si no, la crea usando SQLAlchemy."""
    try:
        parsed_url = urlparse(url)
        base_url = f"{parsed_url.scheme}://{parsed_url.netloc}"
        
        # Buscar la fuente por URL
        fuente = Fuente.query.filter_by(url=base_url).first()
        
        if fuente:
            return fuente.id
        else:
            nombre = parsed_url.netloc.replace('www.', '')
            
            # Crear nueva fuente
            nueva_fuente = Fuente(
                nombre=nombre,
                url=base_url,
                confiabilidad=0.50,
                noticias_verdaderas=0,
                noticias_falsas=0,
                verificada=False,
                created_at=datetime.utcnow()
            )
            db.session.add(nueva_fuente)
            db.session.commit()
            return nueva_fuente.id
    except SQLAlchemyError as e:
        db.session.rollback()
        logger.error(f"Error al obtener o crear fuente: {str(e)}")
        raise

def save_news(titulo, contenido, url, fecha_publicacion, fuente_id):
    """Guarda una noticia en la BD usando SQLAlchemy."""
    try:
        nueva_noticia = Noticia(
            titulo=titulo,
            contenido=contenido,
            url=url,
            fecha_publicacion=fecha_publicacion,
            fuente_id=fuente_id,
            created_at=datetime.utcnow()
        )
        db.session.add(nueva_noticia)
        db.session.commit()
        return nueva_noticia.id
    except SQLAlchemyError as e:
        db.session.rollback()
        logger.error(f"Error al guardar noticia: {str(e)}")
        raise

def get_active_model():
    """Obtiene el ID del modelo activo usando SQLAlchemy."""
    try:
        modelo = ModeloML.query.filter_by(activo=True).order_by(ModeloML.fecha_entrenamiento.desc()).first()
        return modelo.id if modelo else None
    except SQLAlchemyError as e:
        logger.error(f"Error al obtener modelo activo: {str(e)}")
        raise

def save_classification(noticia_id, modelo_id, resultado, confianza, explicacion):
    """Guarda la clasificación en la BD usando SQLAlchemy."""
    try:
        nueva_clasificacion = ClasificacionNoticia(
            noticia_id=noticia_id,
            modelo_id=modelo_id,
            resultado=resultado,
            confianza=confianza,
            explicacion=explicacion,
            fecha_clasificacion=datetime.utcnow()
        )
        db.session.add(nueva_clasificacion)
        
        # Obtener la noticia y su fuente
        noticia = Noticia.query.get(noticia_id)
        if noticia and noticia.fuente_id:
            fuente = Fuente.query.get(noticia.fuente_id)
            
            # Actualizar contadores según el resultado
            if resultado == 'verdadera':
                fuente.noticias_verdaderas += 1
            elif resultado == 'falsa':
                fuente.noticias_falsas += 1
                
            # Recalcular confiabilidad
            total_noticias = fuente.noticias_verdaderas + fuente.noticias_falsas
            if total_noticias > 0:
                fuente.confiabilidad = fuente.noticias_verdaderas / total_noticias
                
            # Actualizar timestamp
            fuente.updated_at = datetime.utcnow()
        
        db.session.commit()
        return nueva_clasificacion.id
    except SQLAlchemyError as e:
        db.session.rollback()
        logger.error(f"Error al guardar clasificación: {str(e)}")
        raise

def save_consultation(usuario_id, noticia_id):
    """Registra una consulta en `historial_consultas` usando SQLAlchemy."""
    try:
        # Si no hay usuario_id, no guardamos la consulta
        if not usuario_id:
            return None
            
        nueva_consulta = HistorialConsulta(
            usuario_id=usuario_id,
            noticia_id=noticia_id,
            fecha_consulta=datetime.utcnow()
        )
        db.session.add(nueva_consulta)
        db.session.commit()
        return nueva_consulta.id
    except SQLAlchemyError as e:
        db.session.rollback()
        logger.error(f"Error al guardar consulta: {str(e)}")
        raise