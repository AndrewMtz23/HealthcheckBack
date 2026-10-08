from dataclasses import dataclass
from pathlib import Path
from threading import RLock
from typing import Any
import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from database.models import ModeloML
from utils.db_utils import get_active_model

MODEL_ROOT = Path(__file__).resolve().parents[1] / "models"
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
_load_lock = RLock()


class ModelUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class LoadedModel:
    id: int
    version: str
    tokenizer: Any
    model: Any


_loaded: LoadedModel | None = None


def prepare_model(expected_id: int) -> LoadedModel:
    """Return an immutable request snapshot; never substitute a different artifact."""
    global _loaded
    with _load_lock:
        selected = ModeloML.query.filter_by(id=expected_id, activo=True).first()
        if selected is None:
            raise ModelUnavailable("El modelo seleccionado ya no está disponible.")
        if _loaded is not None and (_loaded.id, _loaded.version) == (selected.id, selected.version):
            return _loaded
        path = (MODEL_ROOT / f"model_{selected.version}").resolve()
        if path.parent != MODEL_ROOT.resolve() or not path.is_dir():
            raise ModelUnavailable("No se encontraron los archivos del modelo activo.")
        try:
            tokenizer = AutoTokenizer.from_pretrained(str(path), local_files_only=True)
            model = AutoModelForSequenceClassification.from_pretrained(
                str(path), from_tf=False, local_files_only=True)
            model.to(device)
            model.eval()
        except Exception as exc:
            raise ModelUnavailable("No se pudieron cargar los archivos del modelo activo.") from exc
        snapshot = LoadedModel(selected.id, selected.version, tokenizer, model)
        _loaded = snapshot
        return snapshot


def load_model() -> LoadedModel:
    active_id = get_active_model()
    if active_id is None:
        raise ModelUnavailable("No hay un modelo activo configurado.")
    return prepare_model(active_id)


def predict_news(text, loaded_model: LoadedModel | None = None):
    """The caller persists the ID of this exact snapshot, even after activation changes."""
    snapshot = loaded_model if loaded_model is not None else load_model()
    inputs = snapshot.tokenizer(text, return_tensors="pt", truncation=True, padding=True, max_length=512)
    inputs = {key: val.to(device) for key, val in inputs.items()}
    with torch.no_grad():
        outputs = snapshot.model(**inputs)
    probs = F.softmax(outputs.logits, dim=-1)
    _, predicted_class = torch.max(probs, dim=1)
    reliability = round(probs[0, 0].item() * 100, 2)
    label = ["verdadera", "falsa"][int(predicted_class.item())]
    explanation = "La noticia parece confiable." if label == "verdadera" else "La noticia muestra patrones de desinformación."
    return label, reliability, explanation
