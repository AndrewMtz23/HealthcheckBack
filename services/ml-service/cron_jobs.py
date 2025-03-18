import time
import threading
import schedule
import logging
from scrapers.google_news import GoogleNewsScraper

logger = logging.getLogger(__name__)

def job_scrape_news(app):
    """Trabajo programado para scrapear noticias"""
    with app.app_context():
        try:
            logger.info("Iniciando scraping programado de noticias...")
            scraper = GoogleNewsScraper()
            processed_ids = scraper.scrape_news(limit=10)
            logger.info(f"Scraping programado completado. Se procesaron {len(processed_ids)} noticias.")
        except Exception as e:
            logger.error(f"Error en el scraping programado: {str(e)}")

def run_scheduler(app):
    """Ejecuta el scheduler en un hilo separado"""
    # Programar el trabajo cada 12 horas
    schedule.every(12).hours.do(job_scrape_news, app)
    
    # También ejecutarlo inmediatamente al inicio
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