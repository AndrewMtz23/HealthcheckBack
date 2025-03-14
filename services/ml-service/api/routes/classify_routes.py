from flask import Blueprint, request, jsonify
from core.classify_service import predict_news
from utils.article_extractor import extract_news_data
from utils.db_utils import get_or_create_source, save_news, get_active_model, save_classification, save_consultation
from database.models import Noticia, ClasificacionNoticia
import logging

# Configuración básica de logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Crear el Blueprint
classify_bp = Blueprint("classify_bp", __name__)

@classify_bp.route("/predict", methods=["POST"])
def classify():
    """Recibe una noticia (texto o URL), la guarda en la base de datos y la clasifica."""
    data = request.json

    if not data:
        return jsonify({"error": "Por favor, envía un JSON con 'text' o 'url'"}), 400

    try:
        usuario_id = data.get("usuario_id", None)  # Usuario opcional
        extracted_data = {}

        if "url" in data:
            extracted_data = extract_news_data(data["url"])
            if not extracted_data:
                return jsonify({"error": "No se pudo extraer contenido de la URL."}), 400

            # Guardar fuente
            fuente_id = get_or_create_source(data["url"])

            # Guardar noticia
            noticia_id = save_news(
                extracted_data["Título"],
                extracted_data["Texto Completo"],
                data["url"],
                extracted_data["Fecha de Publicación"],
                fuente_id
            )
            text = extracted_data["Texto Completo"]

        elif "text" in data:
            text = data["text"]
            extracted_data = {
                "Título": "No disponible",
                "Texto Completo": text,
                "Autor": "Desconocido",
                "Fecha de Publicación": "Desconocida"
            }

            # Guardar noticia sin URL
            noticia_id = save_news(
                extracted_data["Título"],
                extracted_data["Texto Completo"],
                None,
                None,
                None
            )
        else:
            return jsonify({"error": "El JSON debe contener 'text' o 'url'."}), 400

        # Clasificar la noticia con el modelo de ML
        resultado, confianza, explicacion = predict_news(text)

        # Obtener el modelo activo
        modelo_id = get_active_model()
        if not modelo_id:
            return jsonify({"error": "No hay un modelo activo disponible para la clasificación."}), 500

        # Guardar clasificación
        clasificacion_id = save_classification(noticia_id, modelo_id, resultado, confianza, explicacion)

        # Guardar en historial de consultas
        consulta_id = None
        if usuario_id:
            consulta_id = save_consultation(usuario_id, noticia_id)

        return jsonify({
            "Consulta ID": consulta_id,
            "Noticia ID": noticia_id,
            "Clasificación ID": clasificacion_id,
            "Fuente": data.get("url", "Texto ingresado directamente"),
            **extracted_data,
            "Clasificación": resultado,
            "Confianza": confianza,
            "Explicación": explicacion
        }), 200
    
    except Exception as e:
        logger.error(f"Error durante la clasificación: {str(e)}")
        return jsonify({"error": f"Error durante el procesamiento: {str(e)}"}), 500