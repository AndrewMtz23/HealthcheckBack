import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import os
from config import Config
from database.models import ModeloML
import logging

logger = logging.getLogger(__name__)

# Variables globales para mantener el modelo cargado
tokenizer = None
model = None
model_id = None
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

def load_model():
    """Carga el modelo activo desde la base de datos."""
    global tokenizer, model, model_id
    
    try:
        # Obtener el modelo activo de la base de datos
        modelo_activo = ModeloML.query.filter_by(activo=True).first()
        
        # Si no hay modelo activo, intentar usar el modelo predeterminado
        if not modelo_activo:
            default_model_path = Config.MODEL_PATH
            logger.warning(f"No hay modelo activo en la BD. Usando modelo predeterminado: {default_model_path}")
            tokenizer = AutoTokenizer.from_pretrained(default_model_path)
            model = AutoModelForSequenceClassification.from_pretrained(default_model_path, from_tf=False, use_safetensors=False)
            model_id = None
            return
            
        # Si el modelo ya está cargado, no hacer nada
        if model_id == modelo_activo.id:
            return
            
        # Construir la ruta al modelo
        model_path = os.path.join('models', f"model_{modelo_activo.version}")
        
        # Si la ruta no existe, intentar usar el modelo predeterminado
        if not os.path.exists(model_path):
            logger.warning(f"Ruta del modelo {model_path} no encontrada. Usando modelo predeterminado.")
            model_path = Config.MODEL_PATH
            
        logger.info(f"Cargando modelo desde: {model_path}")
        
        # Cargar el modelo
        tokenizer = AutoTokenizer.from_pretrained(model_path)
        model = AutoModelForSequenceClassification.from_pretrained(model_path, from_tf=False, use_safetensors=False)
        model.to(device)
        model_id = modelo_activo.id
        
        logger.info(f"Modelo {model_id} cargado correctamente")
        
    except Exception as e:
        logger.error(f"Error al cargar el modelo: {str(e)}")
        # En caso de error, intentar cargar el modelo predeterminado
        try:
            default_model_path = Config.MODEL_PATH
            tokenizer = AutoTokenizer.from_pretrained(default_model_path)
            model = AutoModelForSequenceClassification.from_pretrained(default_model_path, from_tf=False, use_safetensors=False)
            model.to(device)
            model_id = None
            logger.warning(f"Se ha cargado el modelo predeterminado debido a un error")
        except Exception as inner_e:
            logger.error(f"Error crítico al cargar modelo predeterminado: {str(inner_e)}")
            raise

def predict_news(text):
    """Clasifica una noticia y devuelve su resultado."""
    global tokenizer, model, device
    
    # Asegurar que el modelo está cargado
    if model is None or tokenizer is None:
        load_model()
        
    inputs = tokenizer(text, return_tensors="pt", truncation=True, padding=True, max_length=512)
    inputs = {key: val.to(device) for key, val in inputs.items()}

    model.eval()
    with torch.no_grad():
        outputs = model(**inputs)

    probs = F.softmax(outputs.logits, dim=-1)
    confidence, predicted_class = torch.max(probs, dim=1)

    verdad_prob = probs[0, 0].item()
    confiabilidad = round(verdad_prob * 100, 2)

    labels = ["verdadera", "falsa"]
    return labels[predicted_class.item()], confiabilidad, \
           "La noticia parece confiable." if labels[predicted_class.item()] == "verdadera" else \
           "La noticia muestra patrones de desinformación."