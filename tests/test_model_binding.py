import pathlib
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'services/ml-service'))
from flask import Flask
from database.db import db
from database.models import ModeloML
from core import classify_service as service


class ModelBinding(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
        db.init_app(self.app)
        self.ctx = self.app.app_context()
        self.ctx.push()
        db.create_all()
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name)
        self.root_patch = patch.object(service, 'MODEL_ROOT', self.root, create=True)
        self.root_patch.start()
        service.model = service.tokenizer = service.model_id = None
        if hasattr(service, '_loaded'): service._loaded = None

    def tearDown(self):
        self.root_patch.stop()
        self.temp.cleanup()
        db.session.remove()
        db.drop_all()
        self.ctx.pop()
        if hasattr(service, '_loaded'): service._loaded = None

    def test_no_active_model_does_not_fall_back_to_untracked_model(self):
        with patch.object(service, 'AutoTokenizer') as tokenizer, patch.object(service, 'AutoModelForSequenceClassification'):
            with self.assertRaises(RuntimeError): service.load_model()
            tokenizer.from_pretrained.assert_not_called()

    def test_missing_artifacts_fail_without_loading_default_or_downloading(self):
        db.session.add(ModeloML(id=1, nombre='Synthetic', version='missing', activo=True))
        db.session.commit()
        with patch.object(service, 'AutoTokenizer') as tokenizer, patch.object(service, 'AutoModelForSequenceClassification'):
            with self.assertRaises(RuntimeError): service.load_model()
            tokenizer.from_pretrained.assert_not_called()

    def test_activation_changes_snapshot_without_mutating_previous_snapshot(self):
        for version in ('first', 'second'): (self.root / ('model_' + version)).mkdir()
        db.session.add_all([ModeloML(id=1, nombre='First', version='first', activo=True),
                            ModeloML(id=2, nombre='Second', version='second', activo=False)])
        db.session.commit()
        with patch.object(service, 'AutoTokenizer') as tokenizer, patch.object(service, 'AutoModelForSequenceClassification') as loader:
            loader.from_pretrained.side_effect = [Mock(name='first'), Mock(name='second')]
            first = service.load_model()
            db.session.get(ModeloML, 1).activo = False
            db.session.get(ModeloML, 2).activo = True
            db.session.commit()
            second = service.load_model()
            self.assertEqual(first.id, 1)
            self.assertEqual(second.id, 2)
            self.assertIsNot(first.model, second.model)
            for call in tokenizer.from_pretrained.call_args_list:
                self.assertTrue(call.kwargs['local_files_only'])


if __name__ == '__main__': unittest.main()
