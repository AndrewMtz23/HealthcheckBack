from flask import Blueprint, request, jsonify
import pandas as pd
from sklearn.model_selection import train_test_split
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification, Trainer, TrainingArguments
from sklearn.metrics import classification_report
import os
import tempfile
import logging
from datetime import datetime
from database.db import db
from database.models import ModeloML
from config import Config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
    """Entrena o reentrea el modelo de clasificación de noticias falsas"""
    try:
        # Validar archivo
        if 'file' not in request.files or request.files['file'].filename == '':
            return jsonify({"error": "Se requiere un archivo CSV de entrenamiento"}), 400
            
        file = request.files['file']
        
        # Obtener parámetros de entrenamiento
        epochs = int(request.form.get('epochs', 3))
        batch_size = int(request.form.get('batch_size', 8))
        learning_rate = float(request.form.get('learning_rate', 2e-5))
        
        # Guardar el archivo temporalmente
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.csv')
        file.save(temp_file.name)
        temp_file.close()
        
        try:
            # Cargar y preprocesar los datos
            df = pd.read_csv(temp_file.name)
            
            # Verificar columnas necesarias
            if 'text' not in df.columns or 'label' not in df.columns:
                os.unlink(temp_file.name)
                return jsonify({"error": "El CSV debe contener las columnas 'text' y 'label'"}), 400
                    
            # Mapear etiquetas a números (0 = real, 1 = falsa)
            label_mapping = {'real': 0, 'verdadera': 0, 'true': 0, 'fake': 1, 'falsa': 1, 'false': 1}
            df['label_numeric'] = df['label'].str.lower().map(label_mapping)
            
            # Verificar etiquetas válidas
            if df['label_numeric'].isna().any():
                invalid_labels = df[df['label_numeric'].isna()]['label'].unique()
                os.unlink(temp_file.name)
                return jsonify({
                    "error": f"Etiquetas no reconocidas: {invalid_labels}. Use 'real'/'verdadera' o 'fake'/'falsa'"
                }), 400
                
        except Exception as e:
            os.unlink(temp_file.name)
            return jsonify({"error": f"Error al procesar el CSV: {str(e)}"}), 400
        
        # Dividir en entrenamiento y validación
        train_texts, val_texts, train_labels, val_labels = train_test_split(
            df["text"].tolist(), df["label_numeric"].tolist(), test_size=0.2
        )
        
        # Obtener el modelo activo
        try:
            modelo_activo = ModeloML.query.filter_by(activo=True).first()
            
            if modelo_activo:
                model_path = os.path.join('models', f"model_{modelo_activo.version}")
                modelo_base_id = modelo_activo.id
                
                if not os.path.exists(model_path):
                    model_path = Config.MODEL_PATH
            else:
                model_path = Config.MODEL_PATH
                modelo_base_id = None
                
            modelo_base_path = model_path
            
        except Exception as e:
            logger.error(f"Error al obtener modelo activo: {str(e)}")
            model_path = Config.MODEL_PATH
            modelo_base_path = model_path
        
        try:
            # Cargar el modelo
            tokenizer = AutoTokenizer.from_pretrained(model_path)
            model = AutoModelForSequenceClassification.from_pretrained(
                model_path, from_tf=False, use_safetensors=False
            )
        except Exception as e:
            os.unlink(temp_file.name)
            return jsonify({"error": f"Error al cargar modelo desde {model_path}: {str(e)}"}), 500
            
        # Mover el modelo a GPU si está disponible
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model.to(device)
        
        # Preparar datos de entrenamiento
        train_encodings = tokenizer(train_texts, truncation=True, padding=True, max_length=512)
        val_encodings = tokenizer(val_texts, truncation=True, padding=True, max_length=512)
        
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
            report_to="none",
        )
        
        # Entrenar y evaluar
        trainer = Trainer(
            model=model,
            args=training_args,
            train_dataset=train_dataset,
            eval_dataset=val_dataset,
        )
        
        trainer.train()
        eval_result = trainer.evaluate()
        
        # Calcular métricas
        predictions = trainer.predict(val_dataset)
        y_pred = predictions.predictions.argmax(axis=-1)
        report = classification_report(val_labels, y_pred, 
                                      target_names=["Real", "Falsa"], 
                                      output_dict=True)
        
        # Guardar el modelo
        version = datetime.now().strftime("%Y%m%d_%H%M%S")
        new_model_path = f"./models/model_{version}"
        os.makedirs(new_model_path, exist_ok=True)
        
        model.save_pretrained(new_model_path)
        tokenizer.save_pretrained(new_model_path)
        
        # Convertir safetensors a bin si es necesario
        safetensor_path = os.path.join(new_model_path, "model.safetensors")
        bin_path = os.path.join(new_model_path, "pytorch_model.bin")
        
        if os.path.exists(safetensor_path):
            try:
                from safetensors.torch import load_file
                weights = load_file(safetensor_path)
                torch.save(weights, bin_path)
                os.remove(safetensor_path)
            except Exception as e:
                logger.warning(f"No se pudo convertir safetensors a bin: {str(e)}")
        
        # Registrar el nuevo modelo en la base de datos
        new_model = ModeloML(
            nombre="News Classifier",
            version=version,
            descripcion=f"Modelo reentrenado con {len(train_texts)} ejemplos",
            precision=float(report['weighted avg']['precision']),
            recall=float(report['weighted avg']['recall']),
            f1_score=float(report['weighted avg']['f1-score']),
            fecha_entrenamiento=datetime.now(),
            activo=False,
            modelo_base=modelo_base_id
        )
        
        db.session.add(new_model)
        db.session.commit()
        
        # Limpiar archivos temporales
        os.unlink(temp_file.name)
        
        return jsonify({
            "success": True,
            "message": f"Modelo reentrenado y guardado con éxito (ID: {new_model.id})",
            "model_id": new_model.id,
            "model_path": new_model_path,
            "base_model": modelo_base_path,
            "base_model_id": modelo_base_id,
            "evaluation": {
                "loss": eval_result["eval_loss"],
                "accuracy": report["accuracy"],
                "precision": report["weighted avg"]["precision"],
                "recall": report["weighted avg"]["recall"],
                "f1_score": report["weighted avg"]["f1-score"]
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error durante el entrenamiento: {str(e)}")
        return jsonify({"error": f"Error durante el entrenamiento: {str(e)}"}), 500

@train_bp.route("/models", methods=["GET"])
def list_models():
    """Lista todos los modelos disponibles en la base de datos"""
    try:
        models = ModeloML.query.order_by(ModeloML.fecha_entrenamiento.desc()).all()
        
        result = []
        for model in models:
            result.append({
                "id": model.id,
                "nombre": model.nombre,
                "version": model.version,
                "precision": float(model.precision) if model.precision else None,
                "recall": float(model.recall) if model.recall else None,
                "f1_score": float(model.f1_score) if model.f1_score else None,
                "fecha_entrenamiento": model.fecha_entrenamiento.isoformat() if model.fecha_entrenamiento else None,
                "activo": model.activo,
                "modelo_base": model.modelo_base
            })
            
        return jsonify({"models": result}), 200
        
    except Exception as e:
        logger.error(f"Error al listar modelos: {str(e)}")
        return jsonify({"error": f"Error al listar modelos: {str(e)}"}), 500

@train_bp.route("/models/<int:model_id>/activate", methods=["POST"])
def activate_model(model_id):
    """Activa un modelo específico y desactiva los demás"""
    try:
        ModeloML.query.update({"activo": False})
        
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
    
@train_bp.route("/models/<int:model_id>", methods=["DELETE"])
def delete_model(model_id):
    """Elimina un modelo por ID, incluyendo sus archivos y modelos derivados"""
    try:
        model = ModeloML.query.get(model_id)
        if not model:
            return jsonify({"error": f"No se encontró modelo con ID {model_id}"}), 404
        
        # No permitir eliminar modelo activo
        if model.activo:
            return jsonify({"error": "No se puede eliminar el modelo activo"}), 400
        
        # Proteger modelo raíz
        if model.modelo_base is None:
            return jsonify({"error": "No se puede eliminar el modelo inicial del sistema"}), 400
        
        # Eliminar modelos derivados
        modelos_derivados = ModeloML.query.filter_by(modelo_base=model_id).all()
        eliminados_derivados = []
        
        for modelo_derivado in modelos_derivados:
            # Eliminar archivos del modelo derivado
            version_derivado = modelo_derivado.version
            model_path_derivado = f"./models/model_{version_derivado}"
            
            if os.path.exists(model_path_derivado):
                try:
                    import shutil
                    shutil.rmtree(model_path_derivado)
                except Exception as e:
                    logger.warning(f"No se pudo eliminar directorio del modelo derivado: {str(e)}")
            
            eliminados_derivados.append(modelo_derivado.id)
            db.session.delete(modelo_derivado)
        
        # Eliminar archivos del modelo principal
        model_path = f"./models/model_{model.version}"
        if os.path.exists(model_path):
            try:
                import shutil
                shutil.rmtree(model_path)
            except Exception as e:
                logger.warning(f"No se pudo eliminar directorio del modelo: {str(e)}")
        
        db.session.delete(model)
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": f"Modelo ID {model_id} eliminado correctamente",
            "modelos_derivados_eliminados": eliminados_derivados
        }), 200
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error al eliminar modelo: {str(e)}")
        return jsonify({"error": f"Error al eliminar modelo: {str(e)}"}), 500