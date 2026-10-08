import ast, pathlib, sys, unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'services' / 'ml-service'))

class Safety(unittest.TestCase):
    def test_diagnostic_scheduler_does_not_start_threads(self):
        source = pathlib.Path(__file__).resolve().parents[1] / 'services/ml-service/cron_jobs.py'
        tree = ast.parse(source.read_text(encoding='utf-8'))
        fn = next(x for x in tree.body if isinstance(x, ast.FunctionDef) and x.name == 'start_scheduler')
        class Threads:
            def Thread(self, **kwargs): raise AssertionError('scraper thread started')
        class Env: environ = {'HEALTHCHECK_DIAGNOSTIC': '1'}
        ns = {'threading': Threads(), 'os': Env(), 'run_scheduler': lambda app: None}
        exec(compile(ast.Module(body=[fn], type_ignores=[]), str(source), 'exec'), ns)
        ns['start_scheduler'](object())

    def test_diagnostic_http_blocks_training_scraping_and_prediction(self):
        source = pathlib.Path(__file__).resolve().parents[1] / 'services/ml-service/app.py'
        tree = ast.parse(source.read_text(encoding='utf-8'))
        fn = next(x for x in tree.body if isinstance(x, ast.FunctionDef) and x.name == 'diagnostic_read_only')
        fn.decorator_list = []
        class Env: environ = {'HEALTHCHECK_DIAGNOSTIC': '1'}
        class Request: method = 'POST'; path = '/api/ml/train/train'
        ns = {'os': Env(), 'request': Request(), 'jsonify': lambda x: x}
        exec(compile(ast.Module(body=[fn], type_ignores=[]), str(source), 'exec'), ns)
        for endpoint in ['/api/ml/train/train', '/api/ml/classify/predict', '/api/ml/classify/scrape/google', '/api/ml/chatbot/chat']:
            ns['request'].path = endpoint
            self.assertEqual(ns['diagnostic_read_only']()[1], 503)
        ns['request'].method = 'GET'; ns['request'].path = '/api/ml/train/models'
        self.assertIsNone(ns['diagnostic_read_only']())

    def test_ssrf_validator_blocks_internal_and_private_destinations(self):
        from utils.article_extractor import validate_url_ssrf
        forbidden_urls = [
            'http://127.0.0.1:8080/secret',
            'http://localhost:5000/api',
            'http://0.0.0.0:3000',
            'http://169.254.169.254/latest/meta-data',
            'http://10.0.0.1/internal',
            'http://192.168.1.1/router',
            'http://172.16.0.1/private',
            'file:///etc/passwd',
            'ftp://example.com/file',
            'javascript:alert(1)',
            'http://admin:secret@example.com/page'
        ]
        for url in forbidden_urls:
            with self.subTest(url=url):
                with self.assertRaises(ValueError):
                    validate_url_ssrf(url)

    # Classification regressions exercise the real Flask blueprint and ORM in
    # test_analysis_regressions.py instead of extracting functions with AST.

if __name__ == '__main__':
    unittest.main()
