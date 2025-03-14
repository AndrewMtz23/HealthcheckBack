from newspaper import Article

def extract_news_data(url):
    """Extrae el título, contenido, autor y fecha de publicación de una noticia desde una URL."""
    try:
        article = Article(url)
        article.download()
        article.parse()

        return {
            "Título": article.title if article.title else "No disponible",
            "Texto Completo": article.text,
            "Autor": ", ".join(article.authors) if article.authors else "Desconocido",
            "Fecha de Publicación": article.publish_date.strftime('%Y-%m-%d') if article.publish_date else "Desconocida"
        }
    except Exception as e:
        print(f"❌ Error extrayendo noticia de {url}: {str(e)}")
        return None
