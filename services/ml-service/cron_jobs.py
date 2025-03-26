import time
import threading
import schedule
import logging
from scrapers.google_news import GoogleNewsScraper
from scrapers.twitter_scraper import TwitterScraper

logger = logging.getLogger(__name__)

def job_scrape_news(app):
    """Trabajo programado para scrapear noticias de Google News"""
    with app.app_context():
        try:
            logger.info("Iniciando scraping programado de noticias desde Google News...")
            scraper = GoogleNewsScraper()
            processed_ids = scraper.scrape_news(limit=10)  # Usa el método que guarda en BD
            logger.info(f"Scraping programado de Google News completado. Se procesaron {len(processed_ids)} noticias.")
        except Exception as e:
            logger.error(f"Error en el scraping programado de Google News: {str(e)}")

def job_scrape_tweets(app):
    """Trabajo programado para scrapear tweets"""
    with app.app_context():
        try:
            logger.info("Iniciando scraping programado de tweets...")
            scraper = TwitterScraper()
            query = "noticias salud mexico enfermedad hospital -toro"
            # Usar el método que guarda en la base de datos
            processed_ids = scraper.scrape_tweets(
                query=query, 
                limit=10, 
                min_length=50
            )
            logger.info(f"Scraping programado de Twitter completado. Se procesaron {len(processed_ids)} tweets.")
        except Exception as e:
            logger.error(f"Error en el scraping programado de Twitter: {str(e)}")

def run_scheduler(app):
    """Ejecuta el scheduler en un hilo separado"""
    # Programar el trabajo de Google News cada 12 horas
    schedule.every(12).hours.do(job_scrape_news, app)
    
    # Programar el trabajo de Twitter cada 8 horas 
    # (desfasado para no ejecutar ambos a la vez)
    schedule.every(8).hours.do(job_scrape_tweets, app)
    
    # También ejecutarlos inmediatamente al inicio (si es necesario)
    job_scrape_tweets(app)
    job_scrape_news(app)

    while True:
        schedule.run_pending()
        time.sleep(60)  # Esperar 1 minuto antes de verificar nuevamente

def start_scheduler(app):
    """Inicia el scheduler en un hilo separado"""
    scheduler_thread = threading.Thread(target=run_scheduler, args=(app,))
    scheduler_thread.daemon = True  # El hilo se cerrará cuando termine el programa principal
    scheduler_thread.start()
    logger.info("Scheduler de scraping iniciado en segundo plano")