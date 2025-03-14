import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import os
from config import Config

# Cargar el modelo de Machine Learning desde la variable de entorno
model_path = Config.MODEL_PATH  

tokenizer = AutoTokenizer.from_pretrained(model_path)
model = AutoModelForSequenceClassification.from_pretrained(model_path, from_tf=False, use_safetensors=False)
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model.to(device)

def predict_news(text):
    """Clasifica una noticia y devuelve su resultado."""
    inputs = tokenizer(text, return_tensors="pt", truncation=True, padding=True, max_length=512)
    inputs = {key: val.to(device) for key, val in inputs.items()}

    model.eval()
    with torch.no_grad():
        outputs = model(**inputs)

    probs = F.softmax(outputs.logits, dim=-1)
    confidence, predicted_class = torch.max(probs, dim=1)

    labels = ["verdadera", "falsa"]
    return labels[predicted_class.item()], round(confidence.item() * 100, 2), \
           "La noticia parece confiable." if labels[predicted_class.item()] == "verdadera" else \
           "La noticia muestra patrones de desinformación."
