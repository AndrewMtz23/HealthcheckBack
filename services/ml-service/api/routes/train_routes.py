from flask import Blueprint, request, jsonify
import pandas as pd
from sklearn.model_selection import train_test_split
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification, Trainer, TrainingArguments
from sklearn.metrics import classification_report
import os
import tempfile
import json
import logging
from datetime import datetime
from database.db import db
from database.models import ModeloML, Noticia, ClasificacionNoticia

# Configuración básica de logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Crear el Blueprint
train_bp = Blueprint("train_bp", __name__)

class FakeNewsDataset(torch.utils.data.Dataset):
    def __init__(self, encodings, labels):
        self.encodings = encodings
        self.labels = labels

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        item = {key: torch.tensor(val[idx]) for key, val in self.encodings.items()}
        item["labels"] = torch.tensor(self.labels[idx])
        return item

@train_bp.route("/train", methods=["POST"])
def train_model():
    """
    Entrena el modelo utilizando noticias ya clasificadas en la base de datos.
    
    Espera una lista de IDs de noticias o un rango de fechas para seleccionar las noticias.
    """
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No se recibieron parámetros para el entrenamiento"}), 400
            
        # Obtener parámetros de entrenamiento
        epochs = int(data.get('epochs', 3))
        batch_size = int(data.get('batch_size', 8))
        learning_rate = float(data.get('learning_rate', 2e-5))
        auto_activate = data.get('auto_activate', False)
        
        # Seleccionar noticias según los parámetros recibidos
        query = db.session.query(
            Noticia.contenido, 
            ClasificacionNoticia.resultado
        ).join(
            ClasificacionNoticia, 
            Noticia.id == ClasificacionNoticia.noticia_id
        )
        
        # Filtrar por IDs específicos si se proporcionan
        if 'noticias_ids' in data and data['noticias_ids']:
            query = query.filter(Noticia.id.in_(data['noticias_ids']))
            
        # Filtrar por rango de fechas si se proporciona
        if 'fecha_inicio' in data and data['fecha_inicio']:
            fecha_inicio = datetime.fromisoformat(data['fecha_inicio'])
            query = query.filter(Noticia.created_at >= fecha_inicio)
            
        if 'fecha_fin' in data and data['fecha_fin']:
            fecha_fin = datetime.fromisoformat(data['fecha_fin'])
            query = query.filter(Noticia.created_at <= fecha_fin)
            
        # Ejecutar la consulta
        resultados = query.all()
        
        if not resultados:
            return jsonify({"error": "No se encontraron noticias clasificadas con los filtros proporcionados"}), 404
            
        # Preparar datos para entrenamiento
        textos = []
        etiquetas = []
        
        for contenido, resultado in resultados:
            textos.append(contenido)
            # Mapeo: 'verdadera' -> 0, 'falsa' -> 1
            etiqueta = 0 if resultado == 'verdadera' else 1
            etiquetas.append(etiqueta)
            
        logger.info(f"Se utilizarán {len(textos)} noticias para el entrenamiento")
        
        # Dividir en entrenamiento y validación
        train_texts, val_texts, train_labels, val_labels = train_test_split(
            textos, etiquetas, test_size=0.2, random_state=42
        )
        
        # Cargar el modelo activo actual desde la base de datos
        modelo_activo = ModeloML.query.filter_by(activo=True).first()
        
        if not modelo_activo:
            return jsonify({"error": "No hay un modelo activo disponible para reentrenar"}), 404
            
        # Obtener ruta del modelo actual
        model_path = os.path.join('models', f"model_{modelo_activo.version}")
        
        if not os.path.exists(model_path):
            model_path = os.environ.get('MODEL_PATH', './models/current')
            
        try:
            tokenizer = AutoTokenizer.from_pretrained(model_path)
            model = AutoModelForSequenceClassification.from_pretrained(
                model_path, from_tf=False, use_safetensors=False
            )
        except Exception as e:
            return jsonify({"error": f"Error al cargar modelo: {str(e)}"}), 500
            
        # Mover el modelo a GPU si está disponible
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model.to(device)
        
        # Tokenizar los textos
        train_encodings = tokenizer(train_texts, truncation=True, padding=True, max_length=512)
        val_encodings = tokenizer(val_texts, truncation=True, padding=True, max_length=512)
        
        # Crear datasets
        train_dataset = FakeNewsDataset(train_encodings, train_labels)
        val_dataset = FakeNewsDataset(val_encodings, val_labels)
        
        # Configurar entrenamiento
        output_dir = tempfile.mkdtemp()
        training_args = TrainingArguments(
            output_dir=output_dir,
            evaluation_strategy="epoch",
            save_strategy="no",
            num_train_epochs=epochs,
            per_device_train_batch_size=batch_size,
            per_device_eval_batch_size=batch_size,
            logging_dir=os.path.join(output_dir, "logs"),
            logging_steps=100,
            learning_rate=learning_rate,
            warmup_steps=100,
            report_to="none",  # Deshabilitar reporting
        )
        
        trainer = Trainer(
            model=model,
            args=training_args,
            train_dataset=train_dataset,
            eval_dataset=val_dataset,
        )
        
        # Entrenar
        trainer.train()
        
        # Evaluar
        eval_result = trainer.evaluate()
        
        # Calcular métricas detalladas
        predictions = trainer.predict(val_dataset)
        y_pred = predictions.predictions.argmax(axis=-1)
        
        report = classification_report(val_labels, y_pred, 
                                      target_names=["Verdadera", "Falsa"], 
                                      output_dict=True)
        
        # Guardar el modelo con la versión actual
        now = datetime.now()
        version = now.strftime("%Y%m%d_%H%M%S")
        new_model_path = os.path.join('models', f"model_{version}")
        os.makedirs(new_model_path, exist_ok=True)
        
        model.save_pretrained(new_model_path)
        tokenizer.save_pretrained(new_model_path)
        
        # Registrar el nuevo modelo en la base de datos
        new_model = ModeloML(
            nombre="News Classifier",
            version=version,
            descripcion=f"Modelo reentrenado con {len(train_texts)} noticias de la base de datos",
            precision=float(report['weighted avg']['precision']),
            recall=float(report['weighted avg']['recall']),
            f1_score=float(report['weighted avg']['f1-score']),
            fecha_entrenamiento=datetime.now(),
            activo=auto_activate  # Activar automáticamente si se solicita
        )
        
        db.session.add(new_model)
        
        # Si se activa automáticamente, desactivar los otros modelos
        if auto_activate:
            ModeloML.query.filter(ModeloML.id != new_model.id).update({"activo": False})
            
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": f"Modelo reentrenado y guardado con éxito (ID: {new_model.id})",
            "model_id": new_model.id,
            "model_path": new_model_path,
            "evaluation": {
                "loss": eval_result["eval_loss"],
                "accuracy": report["accuracy"],
                "precision": report["weighted avg"]["precision"],
                "recall": report["weighted avg"]["recall"],
                "f1_score": report["weighted avg"]["f1-score"]
            },
            "training_data": {
                "total_samples": len(textos),
                "training_samples": len(train_texts),
                "validation_samples": len(val_texts)
            },
            "detailed_report": report
        }), 200
        
    except Exception as e:
        logger.error(f"Error durante el entrenamiento: {str(e)}")
        return jsonify({"error": f"Error durante el entrenamiento: {str(e)}"}), 500

@train_bp.route("/models", methods=["GET"])
def list_models():
    """Lista todos los modelos disponibles en la base de datos."""
    try:
        models = ModeloML.query.order_by(ModeloML.fecha_entrenamiento.desc()).all()
        
        result = []
        for model in models:
            result.append({
                "id": model.id,
                "nombre": model.nombre,
                "version": model.version,
                "descripcion": model.descripcion,
                "precision": float(model.precision) if model.precision else None,
                "recall": float(model.recall) if model.recall else None,
                "f1_score": float(model.f1_score) if model.f1_score else None,
                "fecha_entrenamiento": model.fecha_entrenamiento.isoformat() if model.fecha_entrenamiento else None,
                "activo": model.activo
            })
            
        return jsonify({"models": result}), 200
        
    except Exception as e:
        logger.error(f"Error al listar modelos: {str(e)}")
        return jsonify({"error": f"Error al listar modelos: {str(e)}"}), 500

@train_bp.route("/models/<int:model_id>/activate", methods=["POST"])
def activate_model(model_id):
    """Activa un modelo específico y desactiva los demás."""
    try:
        # Desactivar todos los modelos
        ModeloML.query.update({"activo": False})
        
        # Activar el modelo seleccionado
        model = ModeloML.query.get(model_id)
        if not model:
            return jsonify({"error": f"No se encontró modelo con ID {model_id}"}), 404
            
        model.activo = True
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": f"Modelo {model_id} activado correctamente",
            "model": {
                "id": model.id,
                "nombre": model.nombre,
                "version": model.version,
                "activo": model.activo
            }
        }), 200
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error al activar modelo: {str(e)}")
        return jsonify({"error": f"Error al activar modelo: {str(e)}"}), 500

@train_bp.route("/statistics", methods=["GET"])
def get_training_statistics():
    """Obtiene estadísticas de las noticias clasificadas para entrenamiento."""
    try:
        # Contar total de noticias clasificadas
        total_noticias = db.session.query(ClasificacionNoticia).count()
        
        # Contar noticias por resultado
        noticias_por_resultado = db.session.query(
            ClasificacionNoticia.resultado, 
            db.func.count(ClasificacionNoticia.id)
        ).group_by(ClasificacionNoticia.resultado).all()
        
        resultado_dict = {resultado: count for resultado, count in noticias_por_resultado}
        
        # Obtener distribución por tema
        noticias_por_tema = db.session.query(
            db.func.coalesce(db.func.to_char(Noticia.tema_id), 'Sin tema'),
            db.func.count(Noticia.id)
        ).join(
            ClasificacionNoticia, 
            Noticia.id == ClasificacionNoticia.noticia_id
        ).group_by(Noticia.tema_id).all()
        
        return jsonify({
            "total_noticias_clasificadas": total_noticias,
            "distribucion_por_resultado": resultado_dict,
            "distribucion_por_tema": dict(noticias_por_tema)
        }), 200
        
    except Exception as e:
        logger.error(f"Error al obtener estadísticas: {str(e)}")
        return jsonify({"error": f"Error al obtener estadísticas: {str(e)}"}), 500