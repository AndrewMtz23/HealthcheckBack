from flask import Blueprint, request, jsonify, Response
from core.classify_service import predict_news
from utils.article_extractor import extract_news_data
from utils.db_utils import get_or_create_source, save_news, get_active_model, save_classification, save_consultation, classify_topic, extract_keywords, save_news_keywords
from scrapers.google_news import GoogleNewsScraper
from scrapers.twitter_scraper import TwitterScraper
import logging
from datetime import datetime
import csv
import io
import os

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
            text = extracted_data["Texto Completo"]

        elif "text" in data:
            text = data["text"]
            extracted_data = {
                "Título": "No disponible",
                "Texto Completo": text,
                "Autor": "Desconocido",
                "Fecha de Publicación": None
            }
            fuente_id = None
        else:
            return jsonify({"error": "El JSON debe contener 'text' o 'url'."}), 400

        # PASO 1: Clasificar el Tema dinámicamente
        tema_nombre, tema_id = classify_topic(text)
        
        # PASO 2: Guardar Noticia con su Tema
        noticia_id = save_news(
            extracted_data["Título"],
            extracted_data["Texto Completo"],
            data.get("url"),
            extracted_data["Fecha de Publicación"],
            fuente_id,
            tema_id
        )
        
        # PASO 3: Extraer y Guardar Keywords
        keywords = extract_keywords(text)
        save_news_keywords(noticia_id, keywords)

        # PASO 4: Clasificar Noticia como verdadera o falsa
        resultado, confianza, explicacion = predict_news(text)

        # Obtener el modelo activo
        modelo_id = get_active_model()
        if not modelo_id:
            return jsonify({"error": "No hay un modelo activo disponible para la clasificación."}), 500

        # Guardar clasificación
        clasificacion_id = save_classification(noticia_id, modelo_id, resultado, confianza, explicacion)

        # PASO 5: Guardar en historial de consultas
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
            "Explicación": explicacion,
            "Tema": tema_nombre,
            "Palabras Clave": keywords
        }), 200
    
    except Exception as e:
        logger.error(f"Error durante la clasificación: {str(e)}")
        return jsonify({"error": f"Error durante el procesamiento: {str(e)}"}), 500

@classify_bp.route("/scrape/google", methods=["POST"])
def scrape_google_news():
    """Inicia el scraping de noticias desde Google News y devuelve un CSV con los resultados."""
    try:
        data = request.json or {}
        
        # Obtener parámetros
        rss_url = data.get("rss_url")  # Si es None, usará la URL predeterminada
        limit = data.get("limit", 5)    # Número de noticias a procesar, por defecto 5
        save_to_db = data.get("save_to_db", False)  # Por defecto no guardar en BD
        
        # Iniciar el scraper
        scraper = GoogleNewsScraper()
        
        # Lista para resultados
        results = []
        
        # Si se debe guardar en BD, usar el método original
        if save_to_db:
            processed_news_ids = scraper.scrape_news(rss_url, limit)
            return jsonify({
                "status": "success",
                "message": f"Se procesaron {len(processed_news_ids)} noticias de Google News correctamente.",
                "processed_ids": processed_news_ids
            }), 200
        else:
            # Si no se guarda en BD, obtenemos los resultados sin guardar
            results = scraper.get_news_without_saving(rss_url, limit)
            
            # Crear un CSV en memoria
            output = io.StringIO()
            fieldnames = [
                "titulo", "url", "fecha_publicacion", "fuente", 
                "contenido", "tema", "clasificacion", "confianza", 
                "palabras_clave"
            ]
            
            writer = csv.DictWriter(output, fieldnames=fieldnames)
            writer.writeheader()
            for item in results:
                writer.writerow({
                    "titulo": item.get("titulo", ""),
                    "url": item.get("url", ""),
                    "fecha_publicacion": item.get("fecha_publicacion", ""),
                    "fuente": item.get("fuente", ""),
                    "contenido": item.get("contenido", "")[:500] + "...",  # Truncar para que no sea muy grande
                    "tema": item.get("tema", ""),
                    "clasificacion": item.get("clasificacion", ""),
                    "confianza": item.get("confianza", ""),
                    "palabras_clave": ", ".join(item.get("palabras_clave", []))
                })
            
            # Crear respuesta CSV
            output.seek(0)
            return Response(
                output.getvalue(),
                mimetype="text/csv",
                headers={"Content-Disposition": "attachment;filename=google_news_results.csv"}
            )
        
    except Exception as e:
        logger.error(f"Error durante el scraping de Google News: {str(e)}")
        return jsonify({
            "status": "error",
            "message": f"Error durante el scraping de Google News: {str(e)}"
        }), 500

@classify_bp.route("/scrape/twitter", methods=["POST"])
def scrape_twitter():
    """Inicia el scraping de tweets y devuelve un CSV con los resultados."""
    try:
        data = request.json or {}
        
        # Obtener parámetros
        query = data.get("query", "noticias salud mexico enfermedad hospital -toro")
        start_date = data.get("start_date")
        end_date = data.get("end_date")
        limit = data.get("limit", 10)
        min_length = data.get("min_length", 50)
        save_to_db = data.get("save_to_db", False)  # Por defecto no guardar en BD
        
        # Iniciar el scraper
        scraper = TwitterScraper()
        
        # Si se debe guardar en BD, usar el método original
        if save_to_db:
            processed_news_ids = scraper.scrape_tweets(
                query=query,
                start_date=start_date,
                end_date=end_date,
                limit=limit,
                min_length=min_length
            )
            return jsonify({
                "status": "success",
                "message": f"Se procesaron {len(processed_news_ids)} tweets correctamente.",
                "processed_ids": processed_news_ids
            }), 200
        else:
            # Si no se guarda en BD, obtenemos los resultados sin guardar
            results = scraper.get_tweets_without_saving(
                query=query,
                start_date=start_date,
                end_date=end_date,
                limit=limit,
                min_length=min_length
            )
            
            # Crear un CSV en memoria
            output = io.StringIO()
            fieldnames = [
                "autor", "fecha", "url", "contenido", "tema", 
                "clasificacion", "confianza", "palabras_clave"
            ]
            
            writer = csv.DictWriter(output, fieldnames=fieldnames)
            writer.writeheader()
            for item in results:
                writer.writerow({
                    "autor": item.get("autor", ""),
                    "fecha": item.get("fecha", ""),
                    "url": item.get("url", ""),
                    "contenido": item.get("contenido", ""),
                    "tema": item.get("tema", ""),
                    "clasificacion": item.get("clasificacion", ""),
                    "confianza": item.get("confianza", ""),
                    "palabras_clave": ", ".join(item.get("palabras_clave", []))
                })
            
            # Crear respuesta CSV
            output.seek(0)
            return Response(
                output.getvalue(),
                mimetype="text/csv",
                headers={"Content-Disposition": "attachment;filename=twitter_results.csv"}
            )
        
    except Exception as e:
        logger.error(f"Error durante el scraping de Twitter: {str(e)}")
        return jsonify({
            "status": "error",
            "message": f"Error durante el scraping de Twitter: {str(e)}"
        }), 500