import csv
import time
import random
import logging
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
import os
from utils.db_utils import (
    get_or_create_source, save_news, get_active_model, 
    save_classification, classify_topic, extract_keywords, 
    save_news_keywords
)
from core.classify_service import predict_news

logger = logging.getLogger(__name__)

class TwitterScraper:
    def __init__(self):
        # Configuración del navegador
        self.options = webdriver.ChromeOptions()
        self.options.add_argument("--headless")
        self.options.add_argument("--ignore-certificate-errors")
        self.options.add_argument("--disable-blink-features=AutomationControlled")
        self.driver = None
        self.username = os.getenv("TWITTER_USERNAME")
        self.password = os.getenv("TWITTER_PASSWORD")
        
    def _init_driver(self):
        """Inicializa el driver de Selenium solo cuando es necesario"""
        if self.driver is None:
            self.driver = webdriver.Chrome(
                service=Service(ChromeDriverManager().install()), 
                options=self.options
            )
    
    def close_driver(self):
        """Cierra el driver de Selenium"""
        if self.driver:
            self.driver.quit()
            self.driver = None
    
    def _wait_random(self):
        """Espera un tiempo aleatorio para evitar detección"""
        time.sleep(random.uniform(2, 4))
    
    def _check_for_error_message(self):
        """Verifica si Twitter muestra mensaje de error"""
        try:
            error_element = self.driver.find_element(By.XPATH, "//*[contains(text(), 'Algo salió mal')]")
            if error_element:
                logger.warning("Twitter detectó tráfico automatizado o hubo un error")
                return True
        except:
            pass
        return False
    
    def login(self):
        """Inicia sesión en Twitter"""
        if not self.username or not self.password:
            logger.error("Credenciales de Twitter no configuradas en variables de entorno")
            return False
            
        self._init_driver()
        self.driver.get("https://x.com/i/flow/login?mx=2")
        time.sleep(5)
        
        try:
            # Login con las credenciales
            username_field = WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, 'input[autocomplete="username"]'))
            )
            username_field.send_keys(self.username)
            self.driver.find_element(By.XPATH, "//span[text()='Siguiente']").click()
            time.sleep(2)

            password_field = WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, 'input[name=\"password\"]'))
            )
            password_field.send_keys(self.password)
            self.driver.find_element(By.XPATH, "//span[text()='Iniciar sesión']").click()
            time.sleep(5)
            
            return True
        except Exception as e:
            logger.error(f"Error al iniciar sesión en Twitter: {str(e)}")
            return False
    
    def _scroll_down(self, times=3):
        """Hace scroll hacia abajo en la página"""
        for _ in range(times):
            self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            self._wait_random()
    
    def _extract_tweet_content(self, tweet):
        """Extrae el contenido y metadatos de un tweet"""
        try:
            content = tweet.find_element(By.CSS_SELECTOR, '[data-testid="tweetText"]').text
            author = tweet.find_element(By.CSS_SELECTOR, '[data-testid="User-Name"] span').text
            date_element = tweet.find_element(By.CSS_SELECTOR, 'time')
            tweet_date = date_element.get_attribute("datetime")
            tweet_date_obj = datetime.fromisoformat(tweet_date.replace('Z', '+00:00'))

            link_element = tweet.find_element(By.XPATH, ".//a[contains(@href, '/status/')]")
            tweet_url = link_element.get_attribute("href")
            tweet_id = tweet_url.split("/")[-1]
            
            return {
                "content": content,
                "author": author,
                "date": tweet_date_obj,
                "url": tweet_url,
                "tweet_id": tweet_id
            }
        except Exception as e:
            logger.debug(f"Error al extraer contenido del tweet: {str(e)}")
            return None
    
    def scrape_tweets(self, query="noticias salud", start_date=None, end_date=None, limit=10, min_length=50):
        """
        Scrapea tweets según los criterios especificados, los clasifica y guarda en la base de datos.
        
        Args:
            query (str): Términos de búsqueda para Twitter
            start_date (str): Fecha de inicio en formato YYYY-MM-DD
            end_date (str): Fecha de fin en formato YYYY-MM-DD
            limit (int): Número máximo de tweets a procesar
            min_length (int): Longitud mínima del contenido del tweet
            
        Returns:
            list: Lista de IDs de noticias procesadas
        """
        # Inicializar y hacer login
        self._init_driver()
        if not self.login():
            self.close_driver()
            return []
        
        # Configurar fechas por defecto si no se proporcionan
        if not start_date:
            start_date = (datetime.now().replace(day=1)).strftime("%Y-%m-%d")
        if not end_date:
            end_date = datetime.now().strftime("%Y-%m-%d")
        
        # Construir URL de búsqueda
        search_url = f"https://x.com/search?q={query.replace(' ', '+')}&src=typed_query"
        if start_date and end_date:
            search_url += f"&since={start_date}&until={end_date}"
        
        self.driver.get(search_url)
        time.sleep(5)
        
        if self._check_for_error_message():
            self.close_driver()
            return []
        
        # Lista para almacenar los IDs de las noticias procesadas
        processed_news_ids = []
        tweets_processed = 0
        
        # Procesar tweets hasta alcanzar el límite
        while len(processed_news_ids) < limit:
            self._scroll_down(3)
            tweets = self.driver.find_elements(By.CSS_SELECTOR, '[data-testid="tweet"]')
            
            # Si no hay más tweets para cargar, salir del bucle
            if not tweets:
                break
                
            for tweet in tweets:
                # Evitar procesar tweets ya vistos
                tweet_data = self._extract_tweet_content(tweet)
                if not tweet_data or len(tweet_data["content"]) < min_length:
                    continue
                
                tweets_processed += 1
                
                try:
                    # 1. Obtener o crear la fuente
                    fuente_id = get_or_create_source(tweet_data["url"])
                    
                    # 2. Clasificar el tema
                    tema_nombre, tema_id = classify_topic(tweet_data["content"])
                    
                    # 3. Guardar la noticia
                    noticia_id = save_news(
                        f"Tweet de {tweet_data['author']}",
                        tweet_data["content"],
                        tweet_data["url"],
                        tweet_data["date"],
                        fuente_id,
                        tema_id
                    )
                    
                    # 4. Extraer y guardar keywords
                    keywords = extract_keywords(tweet_data["content"], num_keywords=5)
                    save_news_keywords(noticia_id, keywords)
                    
                    # 5. Clasificar la noticia (verdadera/falsa)
                    resultado, confianza, explicacion = predict_news(tweet_data["content"])
                    modelo_id = get_active_model()
                    
                    # 6. Guardar la clasificación
                    clasificacion_id = save_classification(
                        noticia_id, 
                        modelo_id, 
                        resultado, 
                        confianza, 
                        explicacion
                    )
                    
                    # Añadir a la lista de procesados
                    processed_news_ids.append(noticia_id)
                    
                    logger.info(f"Tweet procesado: {tweet_data['author']} | Clasificación: {resultado} ({confianza}%)")
                    
                    # Si hemos alcanzado el límite, salir
                    if len(processed_news_ids) >= limit:
                        break
                        
                except Exception as e:
                    logger.error(f"Error al procesar tweet: {str(e)}")
                    continue
        
        # Cerrar el driver
        self.close_driver()
        
        logger.info(f"Scraping de Twitter completado. Se procesaron {len(processed_news_ids)} tweets de un total de {tweets_processed} analizados.")
        return processed_news_ids