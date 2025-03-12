from flask import Flask, request, jsonify
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch
import torch.nn.functional as F
import os
from newspaper import Article  # Para extraer texto de una URL

# Inicializar Flask
app = Flask(__name__)

# Ruta del modelo guardado
BASE_DIR = os.path.dirname(os.path.abspath(__file__))  
model_path = os.path.join(BASE_DIR, "models", "bert_health_model")  

# Cargar el tokenizador y el modelo
tokenizer = AutoTokenizer.from_pretrained(model_path)
model = AutoModelForSequenceClassification.from_pretrained(model_path, from_tf=False, use_safetensors=False)

# Mover modelo a GPU si está disponible
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model.to(device)

def extract_text_from_url(url):
    """Extrae el contenido de una URL y devuelve el texto."""
    try:
        article = Article(url)
        article.download()
        article.parse()
        return article.text
    except Exception as e:
        return None

def predict_news(text):
    """Clasifica una noticia como 'Real' o 'Falsa'."""
    inputs = tokenizer(text, return_tensors="pt", truncation=True, padding=True, max_length=512)

    # Mover los datos a GPU si está disponible
    inputs = {key: val.to(device) for key, val in inputs.items()}

    # Realizar la predicción
    model.eval()
    with torch.no_grad():
        outputs = model(**inputs)

    # Obtener las probabilidades con softmax
    probs = F.softmax(outputs.logits, dim=-1)
    confidence, predicted_class = torch.max(probs, dim=1)

    # Mapear la salida a las etiquetas
    labels = ["Real", "Falsa"]
    result = labels[predicted_class.item()]

    return {
        "Clasificación": result,
        "Confianza": round(confidence.item() * 100, 2),
        "Explicación": "La noticia parece confiable." if result == "Real" else "La noticia muestra patrones de desinformación."
    }

@app.route("/", methods=["GET"])
def home():
    return jsonify({"message": "Bienvenido a la API de detección de noticias falsas con BERT"}), 200

@app.route("/predict", methods=["POST"])
def predict():
    """Recibe una noticia en formato JSON (texto o URL) y devuelve la clasificación."""
    data = request.json  # Recibir datos en formato JSON

    if not data:
        return jsonify({"error": "Por favor, envía un JSON con 'text' o 'url'"}), 400

    # Si se proporciona una URL, extraer el contenido
    if "url" in data:
        text = extract_text_from_url(data["url"])
        if not text:
            return jsonify({"error": "No se pudo extraer contenido de la URL."}), 400
    elif "text" in data:
        text = data["text"]
    else:
        return jsonify({"error": "El JSON debe contener 'text' o 'url'."}), 400

    # Predecir el resultado
    result = predict_news(text)

    return jsonify({
        "Fuente": data.get("url", "Texto ingresado directamente"),
        "Texto Analizado": text[:500] + ("..." if len(text) > 500 else ""),  # Muestra solo los primeros 500 caracteres
        **result
    }), 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
