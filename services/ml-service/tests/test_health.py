import unittest
from unittest.mock import patch
from flask import Flask
from api.health import health_bp

class HealthTests(unittest.TestCase):
    def test_public_liveness_does_not_require_identity_or_a_model(self):
        app = Flask(__name__)
        app.register_blueprint(health_bp)
        with patch.dict('os.environ', {'HEALTHCHECK_DIAGNOSTIC': '1'}):
            response = app.test_client().get('/health')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {'status': 'success', 'service': 'ml', 'diagnostic': True})
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
