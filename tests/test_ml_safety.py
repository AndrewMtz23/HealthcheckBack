import ast, pathlib, unittest
class Safety(unittest.TestCase):
    def test_diagnostic_scheduler_does_not_start_threads(self):
        source=pathlib.Path(__file__).resolve().parents[1]/'services/ml-service/cron_jobs.py'
        tree=ast.parse(source.read_text(encoding='utf-8'))
        fn=next(x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name=='start_scheduler')
        class Threads:
            def Thread(self, **kwargs): raise AssertionError('scraper thread started')
        class Env: environ={'HEALTHCHECK_DIAGNOSTIC':'1'}
        ns={'threading':Threads(),'os':Env(),'run_scheduler':lambda app: None}
        exec(compile(ast.Module(body=[fn],type_ignores=[]),str(source),'exec'),ns)
        ns['start_scheduler'](object())
    def test_diagnostic_http_blocks_training_scraping_and_prediction(self):
        source=pathlib.Path(__file__).resolve().parents[1]/'services/ml-service/app.py'
        tree=ast.parse(source.read_text(encoding='utf-8'))
        fn=next(x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name=='diagnostic_read_only')
        fn.decorator_list=[]
        class Env: environ={'HEALTHCHECK_DIAGNOSTIC':'1'}
        class Request: method='POST'; path='/api/ml/train/train'
        ns={'os':Env(),'request':Request(),'jsonify':lambda x:x}
        exec(compile(ast.Module(body=[fn],type_ignores=[]),str(source),'exec'),ns)
        for endpoint in ['/api/ml/train/train','/api/ml/classify/predict','/api/ml/classify/scrape/google','/api/ml/chatbot/chat']:
            ns['request'].path=endpoint
            self.assertEqual(ns['diagnostic_read_only']()[1],503)
        ns['request'].method='GET'; ns['request'].path='/api/ml/train/models'
        self.assertIsNone(ns['diagnostic_read_only']())
if __name__=='__main__': unittest.main()
