import ipaddress
import logging
import socket
import urllib.parse
from datetime import datetime
import urllib3
import time
from bs4 import BeautifulSoup
from newspaper import Article

logger = logging.getLogger(__name__)

# Límites de seguridad y recursos
MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024  # 2 MB máximo de HTML
MAX_REDIRECTS = 5
CONNECT_TIMEOUT = 5.0
READ_TIMEOUT = 10.0
USER_AGENT = "HealthCheck-ArticleExtractor/1.0 (+http://localhost:3000)"

def _assert_public_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> None:
    if not ip.is_global or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
        raise ValueError("Destination is not a public unicast address")


def validate_url_ssrf(url: str) -> list[str]:
    """Resolve once; the returned public addresses are the only allowed peers."""
    if not isinstance(url, str) or not url or any(ord(c) < 32 or ord(c) == 127 for c in url):
        raise ValueError("Invalid URL")
    parsed = urllib.parse.urlsplit(url.strip())
    if parsed.scheme.lower() not in ('http', 'https') or not parsed.hostname or '@' in parsed.netloc:
        raise ValueError("Only HTTP(S) URLs without credentials are allowed")
    port = parsed.port  # raises on malformed ports
    if port is not None and port == 0:
        raise ValueError("Invalid port")
    host = parsed.hostname.rstrip('.').lower()
    if '%' in host or host in {'localhost', 'instance-data'} or host.endswith(('.localhost', '.local', '.internal')):
        raise ValueError("Local hostname is blocked")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        try:
            addresses = list(dict.fromkeys(str(info[4][0]) for info in socket.getaddrinfo(
                host, port or (443 if parsed.scheme == 'https' else 80), socket.AF_UNSPEC, socket.SOCK_STREAM)))
        except socket.gaierror as exc:
            raise ValueError("Unable to resolve destination") from exc
    else:
        addresses = [str(address)]
    if not addresses:
        raise ValueError("No destination addresses")
    for address in addresses:
        _assert_public_ip(ipaddress.ip_address(address))
    return addresses


def safe_download_article(url: str) -> str:
    """Direct connection to a validated numeric IP, preserving HTTPS SNI/verification.

    No environment proxy, automatic redirects, automatic retries or decompression.
    Each redirect gets a new validation and its own pool, always closed.
    """
    current_url = url.strip()
    deadline = time.monotonic() + 20.0
    for hop in range(MAX_REDIRECTS + 1):
        addresses = validate_url_ssrf(current_url)
        parsed = urllib.parse.urlsplit(current_url)
        if parsed.hostname is None:
            raise ValueError("Missing hostname")
        hostname = parsed.hostname.encode('idna').decode('ascii')
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("Download deadline exceeded")
        port = parsed.port or (443 if parsed.scheme == 'https' else 80)
        timeout = urllib3.Timeout(connect=min(CONNECT_TIMEOUT, remaining), read=min(READ_TIMEOUT, remaining), total=remaining)
        if parsed.scheme == 'https':
            pool = urllib3.HTTPSConnectionPool(addresses[0], server_hostname=hostname,
                assert_hostname=hostname, cert_reqs='CERT_REQUIRED', port=port, timeout=timeout, retries=False)
        else:
            pool = urllib3.HTTPConnectionPool(addresses[0], port=port, timeout=timeout, retries=False)
        response = None
        try:
            path = urllib.parse.urlunsplit(('', '', parsed.path or '/', parsed.query, ''))
            response = pool.request('GET', path, headers={'Host': parsed.netloc,
                'User-Agent': USER_AGENT, 'Accept-Encoding': 'identity'},
                redirect=False, preload_content=False, decode_content=False, retries=False)
            if response.status in (301, 302, 303, 307, 308):
                location = response.headers.get('Location')
                if not location or hop == MAX_REDIRECTS:
                    raise ValueError("Invalid or excessive redirects")
                current_url = urllib.parse.urljoin(current_url, location)
                continue
            if not 200 <= response.status < 300:
                raise ValueError("Remote server rejected the request")
            if response.headers.get('Content-Encoding', 'identity').lower() != 'identity':
                raise ValueError("Compressed responses are not accepted")
            length = response.headers.get('Content-Length')
            if length is not None:
                try:
                    declared = int(length)
                except (ValueError, TypeError) as exc:
                    raise ValueError("Invalid Content-Length") from exc
                if not 0 <= declared <= MAX_DOWNLOAD_BYTES:
                    raise ValueError("Response exceeds download limit")
            chunks = []
            size = 0
            while True:
                if time.monotonic() >= deadline:
                    raise TimeoutError("Download deadline exceeded")
                chunk = response.read1(8192, decode_content=False)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_DOWNLOAD_BYTES:
                    raise ValueError("Response exceeds download limit")
                chunks.append(chunk)
            if time.monotonic() >= deadline:
                raise TimeoutError("Download deadline exceeded")
            content_type = response.headers.get('Content-Type', '')
            encoding = 'utf-8'
            for part in content_type.split(';')[1:]:
                key, _, value = part.strip().partition('=')
                if key.lower() == 'charset':
                    encoding = value.strip('"')
            raw = b''.join(chunks)
            try:
                return raw.decode(encoding, errors='replace')
            except LookupError:
                return raw.decode('utf-8', errors='replace')
        except urllib3.exceptions.TimeoutError as exc:
            raise TimeoutError("Download timed out") from exc
        except urllib3.exceptions.HTTPError as exc:
            raise ValueError("Unable to download article") from exc
        finally:
            if response is not None:
                response.close()
            pool.close()
    raise ValueError("Too many redirects")


def extract_news_data_safe(url: str) -> tuple[dict | None, str | None]:
    """
    Versión segura que extrae datos de la noticia o devuelve mensaje de error descriptivo.
    Retorna (datos, error_msg).
    """
    try:
        html = safe_download_article(url)

        # Parsing must stay offline: newspaper otherwise downloads embedded images.
        article = Article(url, fetch_images=False)
        article.set_html(html)
        article.parse()

        text = (article.text or "").strip()
        if not text:
            # Fallback con BeautifulSoup si newspaper no extrajo texto suficiente
            soup = BeautifulSoup(html, "html.parser")
            paragraphs = [p.get_text().strip() for p in soup.find_all("p") if p.get_text().strip()]
            text = "\n\n".join(paragraphs) if paragraphs else soup.get_text(separator=" ", strip=True)

        if not text or len(text.strip()) < 10:
            return None, "No se encontró texto suficiente en la página web para analizar."

        title = article.title if article.title else "No disponible"
        authors = ", ".join(article.authors) if article.authors else "Desconocido"
        publish_date = article.publish_date.strftime("%Y-%m-%d") if isinstance(article.publish_date, datetime) else None

        return {
            "Título": title,
            "Texto Completo": text,
            "Autor": authors,
            "Fecha de Publicación": publish_date
        }, None

    except TimeoutError:
        raise
    except ValueError as ve:
        logger.warning(f"Extracción bloqueada o fallida para {url}: {str(ve)}")
        return None, str(ve)
    except Exception as e:
        logger.error(f"Error inesperado extrayendo noticia de {url}: {str(e)}")
        return None, f"Fallo al procesar la noticia: {str(e)}"

def extract_news_data(url: str) -> dict | None:
    """Extrae el título, contenido, autor y fecha de publicación de una noticia desde una URL."""
    data, _ = extract_news_data_safe(url)
    return data
