"""Invoked only by the isolated Node PostgreSQL harness."""
import os
import sys
sys.path.insert(0,os.getcwd())
from flask import Flask, g
from sqlalchemy import text
from database.db import db
from database.models import ModeloML
from utils.db_utils import save_complete_analysis, get_cached_analysis
from utils.audit import make_event, write_audit

app=Flask(__name__)
app.config.update(SQLALCHEMY_DATABASE_URI=os.environ['AUDIT_TEST_DSN'],SQLALCHEMY_TRACK_MODIFICATIONS=False)
db.init_app(app)
with app.test_request_context():
    g.user_id,g.user_role=2,'usuario'
    assert db.session.execute(text('SELECT current_database()')).scalar().startswith('editorial_')
    model=ModeloML(nombre='Synthetic',version='test',activo=True)
    db.session.add(model)
    db.session.commit()
    model_id=model.id
    kwargs=dict(titulo='Synthetic',contenido='Synthetic audit test content',url=None,fecha_publicacion=None,fuente_url=None,tema_nombre=None,tema_id=None,keywords=[],modelo_id=model_id,resultado='falsa',confianza=0.5,explicacion='Synthetic',usuario_id=2)
    saved=save_complete_analysis(**kwargs)
    cached=get_cached_analysis(None,kwargs['contenido'],model_id,2)
    assert saved['consulta_id']==cached['consulta_id']
    assert db.session.execute(text("SELECT count(*) FROM system_logs WHERE action='NEWS_VIEW'")).scalar()==1
    db.session.commit()
    db.session.execute(text('ALTER TABLE system_logs RENAME TO unavailable_audit_table'))
    db.session.commit()
    try:
        save_complete_analysis(**dict(kwargs,contenido='Must be rolled back'))
        raise AssertionError('audit failure must abort analysis')
    except RuntimeError as error:
        assert str(error)=='AUDIT_WRITE_FAILED'
    assert db.session.execute(text("SELECT count(*) FROM noticias WHERE contenido='Must be rolled back'")).scalar()==0
    db.session.rollback()
    db.session.execute(text('ALTER TABLE unavailable_audit_table RENAME TO system_logs'))
    db.session.commit()
    print('Python SQL audit and cached consultation passed')
