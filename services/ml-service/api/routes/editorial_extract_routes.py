"""Read-only editorial preview: no model inference, history or news persistence."""
from urllib.parse import urlsplit
from flask import Blueprint, jsonify, request
from api.internal_auth import require_gateway
from utils.article_extractor import ArticleAccessDenied, extract_news_data_safe

editorial_extract_bp = Blueprint('editorial_extract_bp', __name__)


@editorial_extract_bp.before_request
def authorize_preview():
    return require_gateway(admin=True)


@editorial_extract_bp.route('/extract', methods=['POST'])
def extract_editorial_preview():
    body = request.get_json(silent=True)
    url = body.get('url') if isinstance(body, dict) else None
    try:
        if not isinstance(url, str) or not 1 <= len(url.strip()) <= 2048:
            raise ValueError()
        url = url.strip()
        parsed = urlsplit(url)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError()
    except ValueError:
        return jsonify(message='Introduce una URL http:// o https:// válida, sin credenciales.'), 400
    try:
        data, error = extract_news_data_safe(url)
        if error or not data:
            return jsonify(message='No se pudo extraer la noticia. Comprueba el enlace o completa los campos manualmente.'), 422
        content = (data.get('Texto Completo') or '').strip()
        title = (data.get('Título') or '').strip()
        if not 10 <= len(content) <= 100000 or len(title) > 500:
            return jsonify(message='El contenido extraído no cumple los límites del editor. Completa los campos manualmente.'), 422
        return jsonify(data={'titulo': '' if title == 'No disponible' else title,
                             'contenido': content, 'url': url,
                             'fecha_publicacion': data.get('Fecha de Publicación')}), 200
    except ArticleAccessDenied:
        return jsonify(message='El sitio bloqueó la lectura automática. Puedes completar la noticia manualmente.'), 422
    except TimeoutError:
        return jsonify(message='El sitio tardó demasiado. Reintenta o completa la noticia manualmente.'), 504
    except Exception:
        return jsonify(message='No se pudo leer la noticia. Reintenta más tarde.'), 502
