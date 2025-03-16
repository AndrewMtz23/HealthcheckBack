from database.db import db
from database.models import Fuente, Noticia, ModeloML, ClasificacionNoticia, HistorialConsulta, Tema
from sqlalchemy.exc import SQLAlchemyError
from datetime import datetime
from urllib.parse import urlparse
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
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

def get_topics_from_db():
    """Extrae los temas y sus palabras clave desde la base de datos usando SQLAlchemy."""
    try:
        temas = Tema.query.filter_by(activo=True).all()
        
        topic_keywords = {}
        topic_ids = {}

        for tema in temas:
            if tema.palabras_clave:
                topic_keywords[tema.nombre] = tema.palabras_clave.split(", ")
                topic_ids[tema.nombre] = tema.id
                
        return topic_keywords, topic_ids
    
    except SQLAlchemyError as e:
        logger.error(f"Error al obtener temas de la base de datos: {str(e)}")
        return {}, {}

def classify_topic(text):
    """Asigna un tema basado en palabras clave obtenidas de la base de datos."""
    try:
        topic_keywords, topic_ids = get_topics_from_db()
        
        if not topic_keywords:
            logger.warning("No se encontraron temas activos con palabras clave")
            return "Sin clasificar", None
        
        topics = list(topic_keywords.keys())
        documents = [" ".join(topic_keywords[topic]) for topic in topics]

        vectorizer = TfidfVectorizer()
        tfidf_matrix = vectorizer.fit_transform(documents + [text])
        
        similarities = cosine_similarity(tfidf_matrix[-1], tfidf_matrix[:-1]).flatten()
        
        best_match_index = similarities.argmax()
        
        # Si la mejor coincidencia tiene una similitud muy baja, no asignar tema
        if similarities[best_match_index] < 0.01:  # Umbral arbitrario, ajustar según necesidad
            return "Sin clasificar", None
            
        best_topic = topics[best_match_index]

        return best_topic, topic_ids[best_topic]
    
    except Exception as e:
        logger.error(f"Error al clasificar tema: {str(e)}")
        return "Sin clasificar", None

def save_news(titulo, contenido, url, fecha_publicacion, fuente_id, tema_id=None):
    """Guarda una noticia en la BD usando SQLAlchemy."""
    try:
        nueva_noticia = Noticia(
            titulo=titulo,
            contenido=contenido,
            url=url,
            fecha_publicacion=fecha_publicacion,
            fuente_id=fuente_id,
            tema_id=tema_id,
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