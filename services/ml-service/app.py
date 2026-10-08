import os
from flask import Flask, request, jsonify
from api.routes.classify_routes import classify_bp
from api.routes.train_routes import train_bp
from api.routes.chatbot_routes import chatbot_bp
from database.db import db, init_db
from database.models import *  # Importar todos los modelos
from config import Config
from cron_jobs import start_scheduler
from flask_cors import CORS


app = Flask(__name__)
CORS(app)

@app.before_request
def diagnostic_read_only():
    if os.environ.get('HEALTHCHECK_DIAGNOSTIC') == '1':
        if request.method not in ('GET', 'HEAD') or request.path != '/api/ml/train/models':
            return jsonify({'error': 'Operation disabled in diagnostic mode'}), 503


# Cargar configuración desde `Config`
app.config.from_object(Config)

# Inicializar la base de datos
init_db(app)

# Registrar los Blueprints
app.register_blueprint(classify_bp, url_prefix="/api/ml/classify")
app.register_blueprint(train_bp, url_prefix="/api/ml/train")
app.register_blueprint(chatbot_bp, url_prefix="/api/ml/chatbot")

if __name__ == "__main__":
    # Verificar si es el proceso principal (no el reloader)
    import os
    if not os.environ.get('WERKZEUG_RUN_MAIN'):
        with app.app_context():
            start_scheduler(app)
            # Load only on an authorized prediction request. Missing artifacts
            # produce a controlled 503 instead of preventing service startup.
            
    app.run(host="0.0.0.0", port=5000, debug=os.environ.get('HEALTHCHECK_DIAGNOSTIC') != '1')
