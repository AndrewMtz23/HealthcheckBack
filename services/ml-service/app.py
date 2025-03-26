from flask import Flask
from api.routes.classify_routes import classify_bp
from api.routes.train_routes import train_bp
from api.routes.chatbot_routes import chatbot_bp
from database.db import db, init_db
from database.models import *  # Importar todos los modelos
from config import Config
from cron_jobs import start_scheduler

app = Flask(__name__)

# Cargar configuración desde `Config`
app.config.from_object(Config)

# Inicializar la base de datos
init_db(app)

# Registrar los Blueprints
app.register_blueprint(classify_bp, url_prefix="/api/classify")
app.register_blueprint(train_bp, url_prefix="/api/train")
app.register_blueprint(chatbot_bp, url_prefix="/api/chatbot")

if __name__ == "__main__":
    # Verificar si es el proceso principal (no el reloader)
    import os
    if not os.environ.get('WERKZEUG_RUN_MAIN'):
        with app.app_context():
            start_scheduler(app)
            from core.classify_service import load_model
            load_model()
            
    app.run(host="0.0.0.0", port=5000, debug=True)