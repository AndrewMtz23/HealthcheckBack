"""Offline regressions: real Flask routes/ORM, synthetic SQLite, no model/network."""
import os
import pathlib
import sys
import unittest
from unittest.mock import patch, Mock
from types import SimpleNamespace

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'services/ml-service'))
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'

from flask import Flask
from sqlalchemy import event
from database.db import db
from database.models import (Usuario, ModeloML, Fuente, Noticia,
    ClasificacionNoticia, HistorialConsulta, Keyword, NoticiaKeyword, Tema)

# Importing these modules must not download corpora or load model artifacts.
from utils import db_utils
from api.routes import classify_routes as routes
from utils import article_extractor as extractor

SECRET = 'isolated-analysis-secret-not-for-deployment'
HEADERS = {'X-Gateway-Secret': SECRET, 'X-User-Id': '1'}


class AnalysisRegression(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'ML_GATEWAY_SECRET': SECRET, 'JWT_SECRET': SECRET})
        self.env.start()
        self.app = Flask(__name__)
        self.app.config.update(TESTING=True, SQLALCHEMY_DATABASE_URI='sqlite:///:memory:')
        db.init_app(self.app)
        self.app.register_blueprint(routes.classify_bp, url_prefix='/classify')
        self.ctx = self.app.app_context()
        self.ctx.push()
        db.create_all()
        db.session.add_all([
            Usuario(id=1, nombre='Synthetic one', email='one@example.invalid'),
            Usuario(id=2, nombre='Synthetic two', email='two@example.invalid'),
            ModeloML(id=1, nombre='Synthetic model', version='synthetic', activo=True),
            Tema(id=1, nombre='Salud', activo=True),
        ])
        db.session.commit()
        self.client = self.app.test_client()
        self.patches = [
            patch.object(routes, 'prepare_model', return_value=SimpleNamespace(id=1), create=True),
            patch.object(routes, 'predict_news', return_value=('verdadera', 87.0, 'Synthetic explanation')),
            patch.object(routes, 'classify_topic', return_value=('Salud', 1)),
            patch.object(routes, 'extract_keywords', return_value=['salud']),
        ]
        for p in self.patches: p.start()

    def tearDown(self):
        for p in reversed(self.patches): p.stop()
        db.session.remove()
        db.drop_all()
        self.ctx.pop()
        self.env.stop()

    def counts(self):
        return tuple(db.session.query(m).count() for m in
            (Fuente, Noticia, ClasificacionNoticia, HistorialConsulta, Keyword, NoticiaKeyword))

    def post(self, body, headers=HEADERS):
        return self.client.post('/classify/predict', json=body, headers=headers)

    def test_direct_request_without_identity_is_rejected_without_writes(self):
        before = self.counts()
        response = self.post({'text': 'Synthetic health news for testing.'}, {})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.counts(), before)

    def test_direct_request_with_forged_body_identity_is_rejected(self):
        self.assertEqual(self.post({'text':'Synthetic health news.', 'usuario_id':2}, {}).status_code, 403)
        self.assertEqual(self.counts(), (0, 0, 0, 0, 0, 0))

    def test_gateway_secret_without_valid_header_identity_cannot_use_body_identity(self):
        for identity in (None, '', '0', '-1', 'nan'):
            headers = {'X-Gateway-Secret': SECRET}
            if identity is not None: headers['X-User-Id'] = identity
            with self.subTest(identity=identity):
                self.assertEqual(self.post({'text': 'Synthetic text for testing.', 'usuario_id': 2}, headers).status_code, 403)
        self.assertEqual(self.counts(), (0, 0, 0, 0, 0, 0))

    def test_missing_internal_secret_fails_closed_even_with_jwt_secret(self):
        with patch.dict(os.environ, {'ML_GATEWAY_SECRET': ''}):
            self.assertEqual(self.post({'text': 'Synthetic text for testing.'}).status_code, 503)
        self.assertEqual(self.counts(), (0, 0, 0, 0, 0, 0))

    def test_no_active_model_never_downloads_or_writes(self):
        ModeloML.query.first().activo = False
        db.session.commit()
        with patch.object(routes, 'extract_news_data_safe', side_effect=AssertionError('network')):
            self.assertEqual(self.post({'url': 'https://example.invalid/news'}).status_code, 503)
        self.assertEqual(self.counts(), (0, 0, 0, 0, 0, 0))

    def test_text_retry_preserves_one_complete_analysis_and_one_history(self):
        body = {'text': 'Synthetic health news for testing.', 'usuario_id': 2}
        first = self.post(body)
        self.assertEqual(first.status_code, 200, first.json)
        second = self.post(body)
        self.assertEqual(second.status_code, 200, second.json)
        self.assertEqual(self.counts(), (0, 1, 1, 1, 1, 1))
        self.assertEqual(HistorialConsulta.query.one().usuario_id, 1)
        self.assertEqual(first.json['Noticia ID'], second.json['Noticia ID'])
        self.assertTrue(second.json['Reutilizado'])

    def test_url_retry_returns_saved_content_without_downloading_or_inference(self):
        article = {'Título': 'Original title', 'Texto Completo': 'Original synthetic health article.',
                   'Fecha de Publicación': '2026-10-07', 'Autor': 'External author'}
        with patch.object(routes, 'extract_news_data_safe', return_value=(article, None)):
            first = self.post({'url': 'https://example.invalid/news'})
        self.assertEqual(first.status_code, 200, first.json)
        with patch.object(routes, 'extract_news_data_safe', side_effect=AssertionError('second download')), \
             patch.object(routes, 'predict_news', side_effect=AssertionError('second inference')):
            second = self.post({'url': 'https://example.invalid/news'})
        self.assertEqual(second.status_code, 200, second.json)
        for key in ('Título', 'Texto Completo', 'Clasificación', 'Tema', 'Palabras Clave', 'Consulta ID'):
            self.assertEqual(first.json[key], second.json[key], key)
        self.assertEqual(self.counts(), (1, 1, 1, 1, 1, 1))

    def test_different_user_reuses_analysis_but_gets_own_history(self):
        body = {'text': 'Synthetic health news for testing.'}
        first = self.post(body)
        second = self.post(body, {**HEADERS, 'X-User-Id': '2'})
        self.assertEqual(second.status_code, 200, second.json)
        self.assertEqual(first.json['Noticia ID'], second.json['Noticia ID'])
        self.assertNotEqual(first.json['Consulta ID'], second.json['Consulta ID'])
        self.assertEqual(self.counts(), (0, 1, 1, 2, 1, 1))

    def test_late_history_failure_rolls_back_every_table(self):
        before = self.counts()
        def fail(session, *_):
            if any(isinstance(x, HistorialConsulta) for x in session.new):
                raise RuntimeError('synthetic persistence failure')
        event.listen(db.session(), 'before_flush', fail)
        try:
            with self.assertLogs(routes.logger, level='ERROR'):
                response = self.post({'text': 'Synthetic health news for testing.'})
        finally:
            event.remove(db.session(), 'before_flush', fail)
        self.assertEqual(response.status_code, 500)
        self.assertNotIn('synthetic persistence failure', response.get_data(as_text=True))
        self.assertEqual(self.counts(), before)

    def test_oversize_extracted_text_is_rejected_without_writes(self):
        with patch.object(routes, 'extract_news_data_safe', return_value=({'Texto Completo': 'a' * 50001}, None)):
            self.assertEqual(self.post({'url': 'https://example.invalid/news'}).status_code, 400)
        self.assertEqual(self.counts(), (0, 0, 0, 0, 0, 0))

    def test_missing_model_artifacts_returns_503_before_download(self):
        with patch.object(routes, 'prepare_model', side_effect=routes.ModelUnavailable('missing')), \
             patch.object(routes, 'extract_news_data_safe', side_effect=AssertionError('download')):
            response = self.post({'url':'https://example.invalid/news'})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.counts(), (0, 0, 0, 0, 0, 0))

    def test_expired_deadline_never_writes(self):
        response = self.post({'text':'Synthetic health news.'}, {**HEADERS, 'X-Request-Deadline':'1'})
        self.assertEqual(response.status_code, 504)
        self.assertEqual(self.counts(), (0, 0, 0, 0, 0, 0))

    def test_expiry_after_prediction_never_persists(self):
        clock = [0.0]
        def delayed_prediction(*_, **__):
            clock[0] = 100.0
            return ('verdadera', 90, 'Synthetic')
        with patch.object(routes.time, 'monotonic', side_effect=lambda: clock[0]), \
             patch.object(routes, 'predict_news', side_effect=delayed_prediction):
            response = self.post({'text':'Synthetic health news.'})
        self.assertEqual(response.status_code, 504)
        self.assertEqual(self.counts(), (0, 0, 0, 0, 0, 0))

    def test_new_model_creates_separate_analysis_and_keeps_previous_snapshot(self):
        body = {'text':'Synthetic health news for model versions.'}
        first = self.post(body)
        ModeloML.query.first().activo = False
        db.session.add(ModeloML(id=2, nombre='Second synthetic', version='second', activo=True))
        db.session.commit()
        with patch.object(routes, 'prepare_model', return_value=SimpleNamespace(id=2)), \
             patch.object(routes, 'predict_news', return_value=('falsa', 12.0, 'Second synthetic')):
            second = self.post(body)
        self.assertEqual(second.status_code, 200, second.json)
        self.assertEqual(first.json['Modelo ID'], 1)
        self.assertEqual(second.json['Modelo ID'], 2)
        self.assertNotEqual(first.json['Noticia ID'], second.json['Noticia ID'])
        self.assertEqual(db.session.get(ClasificacionNoticia, first.json['Clasificación ID']).resultado, 'verdadera')


class DownloadRegression(unittest.TestCase):
    def test_article_parser_does_not_fetch_embedded_internal_images(self):
        html = '<html><head><title>Synthetic news</title></head><body><article>' + \
            '<p>' + ('Synthetic health news with enough words for a full paragraph. ' * 30) + \
            '</p><img src="http://169.254.169.254/latest/meta-data"></article></body></html>'
        with patch.object(extractor, 'safe_download_article', return_value=html), \
             patch('newspaper.images.fetch_url', return_value=None) as secondary_download:
            data, error = extractor.extract_news_data_safe('https://example.invalid/news')
        self.assertIsNone(error)
        self.assertTrue(data['Texto Completo'])
        secondary_download.assert_not_called()

    def response(self, *, status=200, headers=None, chunks=None):
        response = Mock(status=status, headers=headers or {})
        response.read1.side_effect = [*(chunks or [b'<html>synthetic</html>']), b'']
        return response

    def dns(self, ip):
        return [(2, 1, 6, '', (ip, 443))]

    def test_https_connects_to_validated_ip_while_verifying_original_hostname(self):
        response = self.response()
        pool = Mock()
        pool.request.return_value = response
        # A second DNS resolution would now point to a private IP.
        with patch.object(extractor.socket, 'getaddrinfo', side_effect=[self.dns('93.184.216.34'), self.dns('127.0.0.1')]) as dns, \
             patch('urllib3.HTTPSConnectionPool', return_value=pool) as connection:
            self.assertEqual(extractor.safe_download_article('https://example.invalid/news?q=1'), '<html>synthetic</html>')
        self.assertEqual(dns.call_count, 1)
        self.assertEqual(connection.call_args.args[0], '93.184.216.34')
        self.assertEqual(connection.call_args.kwargs['server_hostname'], 'example.invalid')
        self.assertEqual(connection.call_args.kwargs['assert_hostname'], 'example.invalid')
        self.assertEqual(connection.call_args.kwargs['cert_reqs'], 'CERT_REQUIRED')
        self.assertEqual(pool.request.call_args.kwargs['headers']['Host'], 'example.invalid')
        response.close.assert_called_once()
        pool.close.assert_called_once()

    def test_redirect_to_private_ip_is_blocked_and_resources_are_closed(self):
        response = self.response(status=302, headers={'Location':'http://127.0.0.1/secret'})
        pool = Mock()
        pool.request.return_value = response
        with patch.object(extractor.socket, 'getaddrinfo', return_value=self.dns('93.184.216.34')), \
             patch('urllib3.HTTPSConnectionPool', return_value=pool):
            with self.assertRaises(ValueError): extractor.safe_download_article('https://example.invalid/news')
        response.close.assert_called_once()
        pool.close.assert_called_once()

    def test_stream_limit_applies_even_without_content_length(self):
        response = self.response(chunks=[b'x' * extractor.MAX_DOWNLOAD_BYTES, b'x'])
        pool = Mock()
        pool.request.return_value = response
        with patch.object(extractor.socket, 'getaddrinfo', return_value=self.dns('93.184.216.34')), \
             patch('urllib3.HTTPSConnectionPool', return_value=pool):
            with self.assertRaises(ValueError): extractor.safe_download_article('https://example.invalid/news')
        response.close.assert_called_once()

    def test_shared_address_space_is_not_a_public_destination(self):
        with self.assertRaises(ValueError): extractor.validate_url_ssrf('http://100.64.0.1/news')

    def test_declared_oversize_is_rejected_before_reading(self):
        response = Mock(status=200, headers={'Content-Length': str(extractor.MAX_DOWNLOAD_BYTES + 1)})
        response.read1.side_effect = [b'small', b'']
        pool = Mock()
        pool.request.return_value = response
        with patch.object(extractor, 'validate_url_ssrf', return_value=['93.184.216.34']), \
             patch('urllib3.HTTPSConnectionPool', return_value=pool):
            with self.assertRaises(ValueError): extractor.safe_download_article('https://example.invalid/news')
        response.read1.assert_not_called()


if __name__ == '__main__': unittest.main()
