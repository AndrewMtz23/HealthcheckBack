import os
import unittest
from unittest.mock import patch
from flask import Flask


class EditorialExtract(unittest.TestCase):
    def setUp(self):
        from api.routes.editorial_extract_routes import editorial_extract_bp
        self.app = Flask(__name__)
        self.app.register_blueprint(editorial_extract_bp, url_prefix='/api/ml/classify')
        self.client = self.app.test_client()
        self.env = patch.dict(os.environ, {'ML_GATEWAY_SECRET': 'x' * 32})
        self.env.start()
        self.headers = {'X-Gateway-Secret': 'x' * 32, 'X-User-Id': '1', 'X-User-Role': 'admin'}

    def tearDown(self):
        self.env.stop()

    def test_admin_preview_returns_fields_without_database_or_model(self):
        with patch('api.routes.editorial_extract_routes.extract_news_data_safe', return_value=({'Título': 'Article', 'Texto Completo': 'A complete synthetic article.', 'Fecha de Publicación': '2026-10-15'}, None)) as extract:
            response = self.client.post('/api/ml/classify/extract', json={'url': 'https://example.org/article'}, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['data']['titulo'], 'Article')
        self.assertEqual(response.json['data']['fecha_publicacion'], '2026-10-15')
        self.assertNotIn('id', response.json['data'])
        extract.assert_called_once()

    def test_non_admin_and_invalid_input_do_not_extract(self):
        with patch('api.routes.editorial_extract_routes.extract_news_data_safe') as extract:
            for headers in ({}, {**self.headers, 'X-User-Role': 'usuario'}):
                self.assertEqual(self.client.post('/api/ml/classify/extract', json={'url': 'https://example.org'}, headers=headers).status_code, 403)
            for body in ({}, {'url': 'file:///tmp/a'}, {'url': []}, {'url': 'https://u:p@example.org'}):
                self.assertEqual(self.client.post('/api/ml/classify/extract', json=body, headers=self.headers).status_code, 400)
            extract.assert_not_called()

    def test_extraction_failures_are_actionable_and_sanitized(self):
        from utils.article_extractor import ArticleAccessDenied
        for failure, status in ((ArticleAccessDenied(), 422), (TimeoutError(), 504)):
            with patch('api.routes.editorial_extract_routes.extract_news_data_safe', side_effect=failure):
                self.assertEqual(self.client.post('/api/ml/classify/extract', json={'url': 'https://example.org'}, headers=self.headers).status_code, status)
        with patch('api.routes.editorial_extract_routes.extract_news_data_safe', return_value=(None, 'private error')):
            response = self.client.post('/api/ml/classify/extract', json={'url': 'https://example.org'}, headers=self.headers)
            self.assertEqual(response.status_code, 422)
            self.assertNotIn('private error', response.get_data(as_text=True))
