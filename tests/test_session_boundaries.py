"""Real Flask blueprints; synthetic DB and replaced external inference/scrapers."""
import os
import pathlib
import sys
import unittest
from unittest.mock import Mock, patch
from types import SimpleNamespace

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'services/ml-service'))
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['OPENAI_API_KEY'] = 'synthetic-never-used'
from flask import Flask
from database.db import db
from api.routes import classify_routes, train_routes, chatbot_routes

SECRET = 'synthetic-internal-session-secret-123'
def headers(user='1', role='admin'):
    return {'X-Gateway-Secret': SECRET, 'X-User-Id': user, 'X-User-Role': role}

class SessionBoundaries(unittest.TestCase):
    def setUp(self):
        self.network = patch('socket.socket.connect', side_effect=AssertionError('Network forbidden in session tests'))
        self.network.start()
        self.env = patch.dict(os.environ, {'ML_GATEWAY_SECRET': SECRET})
        self.env.start()
        self.app = Flask(__name__)
        self.app.config.update(TESTING=True, SQLALCHEMY_DATABASE_URI='sqlite:///:memory:')
        db.init_app(self.app)
        self.app.register_blueprint(classify_routes.classify_bp, url_prefix='/classify')
        self.app.register_blueprint(train_routes.train_bp, url_prefix='/train')
        self.app.register_blueprint(chatbot_routes.chatbot_bp, url_prefix='/chatbot')
        self.ctx = self.app.app_context(); self.ctx.push(); db.create_all()
        self.client = self.app.test_client()

    def tearDown(self):
        db.session.remove(); db.drop_all(); self.ctx.pop(); self.env.stop(); self.network.stop()

    def test_direct_model_routes_require_internal_origin_and_admin(self):
        for method, path in [('GET','/train/models'),('POST','/train/train'),
                             ('POST','/train/models/999/activate'),('DELETE','/train/models/999')]:
            for h in ({}, {'X-User-Role':'admin','X-User-Id':'1'}, headers(role='usuario')):
                with self.subTest(path=path, headers=h.keys()):
                    self.assertEqual(self.client.open(path, method=method, headers=h, json={}).status_code, 403)
        self.assertEqual(self.client.get('/train/models', headers=headers()).status_code, 200)

    def test_direct_scraping_cannot_bypass_gateway(self):
        scraper = Mock()
        scraper.return_value.get_news_without_saving.return_value = []
        scraper.return_value.scrape_tweets.return_value = []
        scraper.return_value.get_tweets_without_saving.return_value = []
        modules = {'scrapers.google_news':SimpleNamespace(GoogleNewsScraper=scraper),
                   'scrapers.twitter_scraper':SimpleNamespace(TwitterScraper=scraper)}
        with patch.dict(sys.modules, modules):
            for path in ['/classify/scrape/google','/classify/scrape/twitter']:
                for h in ({},headers(role='usuario')):
                    with self.subTest(path=path):
                        self.assertEqual(self.client.post(path, json={}, headers=h).status_code,403)
            scraper.assert_not_called()

    def test_chat_is_authenticated_and_conversations_are_owned(self):
        agent = Mock()
        agent.invoke.return_value = {'output':'Synthetic response'}
        with patch.object(chatbot_routes, 'conversational_agent_executor', agent):
            self.assertEqual(self.client.post('/chatbot/chat',json={'message':'test'}).status_code,403)
            for user in ['1','2']:
                self.assertEqual(self.client.post('/chatbot/chat',json={'message':'test','session_id':'same'},headers=headers(user,'usuario')).status_code,200)
            keys = [call.args[1]['configurable']['session_id'] for call in agent.invoke.call_args_list]
            self.assertEqual(len(keys),2)
            self.assertNotEqual(keys[0], keys[1], 'Client-controlled conversation IDs must be scoped to authenticated identity')

    def test_unconfigured_internal_secret_fails_closed(self):
        with patch.dict(os.environ, {'ML_GATEWAY_SECRET':''}):
            self.assertEqual(self.client.get('/train/models',headers=headers()).status_code,503)

if __name__ == '__main__': unittest.main()
