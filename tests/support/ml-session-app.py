"""Integration host for the real model-list blueprint; no inference or providers."""
import os
import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'services/ml-service'))
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
from flask import Flask
from database.db import db
from api.routes.train_routes import train_bp

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
db.init_app(app)
app.register_blueprint(train_bp, url_prefix='/api/ml/train')
with app.app_context(): db.create_all()

@app.before_request
def no_mutations():
    from flask import request
    if request.method not in ('GET', 'HEAD', 'OPTIONS'):
        return {'message':'Effects disabled in this test host'}, 503

@app.after_request
def identity(response):
    response.headers['X-Healthcheck-Test-Instance'] = os.environ['HEALTHCHECK_TEST_INSTANCE']
    return response

@app.get('/api/health')
def health(): return {'status':'ok'}

app.run(host='127.0.0.1', port=int(os.environ['PORT']), debug=False, use_reloader=False)
