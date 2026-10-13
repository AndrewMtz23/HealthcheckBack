"""Isolated SQLAlchemy persistence check; no model training or app imports."""
import os, sys
from pathlib import Path
from decimal import Decimal
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'services/ml-service'))
os.environ.update(DB_HOST='127.0.0.1',DB_PORT='55432',DB_NAME='phase00_contracts',DB_USER='phase00',DB_PASSWORD='unused',PGOPTIONS='-c default_transaction_read_only=off')
from flask import Flask
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from database.db import init_db, db
from database.models import ModeloML, Noticia
app=Flask(__name__);init_db(app)
with app.app_context():
    directory=db.session.execute(text('SHOW data_directory')).scalar_one()
    assert Path(directory).resolve()==(root.parent/'.healthcheck-logs/phase00-pg').resolve(), 'Unexpected scratch instance'
    db.session.rollback()
    try:
        model=ModeloML(id=-100,nombre='Synthetic rollback-only',version='phase00-rollback',precision=Decimal('97.25'),activo=False)
        db.session.add(model);db.session.flush();db.session.expire_all()
        assert db.session.get(ModeloML,-100).precision==Decimal('97.25')
        print('SQLAlchemy insert/read DECIMAL verified; rolling back scratch row')
    finally: db.session.rollback()
    assert db.session.get(ModeloML,-100) is None
    try:
        Noticia.query.first()
        raise AssertionError('Expected missing fecha_analisis')
    except ProgrammingError as error:
        assert error.orig.pgcode=='42703'
        print('Known ML schema mismatch reproduced: 42703')
    finally: db.session.rollback()
