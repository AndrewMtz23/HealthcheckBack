"""Explicit opt-in runner. Only the existing isolated cluster on 127.0.0.1:55432.
Creates/drops its own uniquely named database, never the application database.
"""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from pathlib import Path
import sys
import uuid
import psycopg2
from psycopg2 import sql

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'services/ml-service'))
from flask import Flask
from sqlalchemy import event
from database.db import db
from database.models import Usuario, ModeloML, Noticia, ClasificacionNoticia, HistorialConsulta, Fuente, Keyword, NoticiaKeyword
from utils.db_utils import save_complete_analysis, get_cached_analysis


def run():
    cfg = dict(host='127.0.0.1', port=55432, user='phase00', password='unused', connect_timeout=3)
    control = psycopg2.connect(**cfg, dbname='postgres', options='-c default_transaction_read_only=off')
    control.autocommit = True
    name = 'ml_analysis_' + uuid.uuid4().hex
    created = False
    app = Flask(__name__)
    try:
        with control.cursor() as cur:
            cur.execute('SHOW data_directory')
            actual = Path(cur.fetchone()[0]).resolve()
            expected = (ROOT.parent / '.healthcheck-logs/phase00-pg').resolve()
            if actual != expected:
                raise RuntimeError('Refusing a PostgreSQL cluster outside the isolated fixture')
            cur.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
            created = True
        app.config.update(SQLALCHEMY_DATABASE_URI=f'postgresql://phase00:unused@127.0.0.1:55432/{name}',
            SQLALCHEMY_ENGINE_OPTIONS={'connect_args': {'options': '-c default_transaction_read_only=off -c statement_timeout=10000'}})
        db.init_app(app)
        with app.app_context():
            db.create_all()
            db.session.add_all([Usuario(id=1, nombre='One', email='one@example.invalid'),
                Usuario(id=2, nombre='Two', email='two@example.invalid'),
                ModeloML(id=1, nombre='Synthetic', version='test', activo=True)])
            db.session.commit()
        payload = dict(titulo='Synthetic', contenido='Synthetic health article for isolation tests.',
            url='https://example.invalid/news', fecha_publicacion=None, fuente_url='https://example.invalid/news',
            tema_nombre=None, tema_id=None, keywords=['salud'], modelo_id=1,
            resultado='verdadera', confianza=87, explicacion='Synthetic', usuario_id=1)
        start = Barrier(8)
        def save(_):
            with app.app_context():
                start.wait(timeout=10)
                return save_complete_analysis(**payload)
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(save, range(8)))
        assert len({r['noticia_id'] for r in results}) == 1
        assert len({r['consulta_id'] for r in results}) == 1
        assert sum(not r['reutilizado'] for r in results) == 1
        with app.app_context():
            tables = (Fuente, Noticia, ClasificacionNoticia, HistorialConsulta, Keyword, NoticiaKeyword)
            def counts(): return tuple(db.session.query(m).count() for m in tables)
            assert counts() == (1, 1, 1, 1, 1, 1), counts()
            assert Fuente.query.one().noticias_verdaderas == 1
            cached = get_cached_analysis(payload['url'], None, 1, 2)
            assert cached['noticia_id'] == results[0]['noticia_id']
            assert HistorialConsulta.query.count() == 2
            before = counts()
            def fail(session, *_):
                if any(isinstance(row, HistorialConsulta) for row in session.new):
                    raise RuntimeError('injected late failure')
            event.listen(db.session(), 'before_flush', fail)
            try:
                try:
                    save_complete_analysis(**{**payload, 'url':'https://another.invalid/new',
                        'fuente_url':'https://another.invalid/new', 'keywords':['different']})
                except RuntimeError as exc:
                    assert str(exc) == 'injected late failure'
                else:
                    raise AssertionError('Injected failure was not raised')
            finally:
                event.remove(db.session(), 'before_flush', fail)
            assert counts() == before
            # Text submissions have the same retry semantics, without fabricated URLs.
            first = save_complete_analysis(**{**payload, 'url':None, 'fuente_url':None})
            second = save_complete_analysis(**{**payload, 'url':None, 'fuente_url':None})
            assert first['noticia_id'] == second['noticia_id']
            assert first['consulta_id'] == second['consulta_id']
        print('PASS: PostgreSQL concurrent retry (8 sessions), coherent cache, per-user history, rollback, text retry')
    finally:
        if created:
            if 'sqlalchemy' in app.extensions:
                with app.app_context():
                    db.session.remove()
                    db.engine.dispose()
            with control.cursor() as cur:
                cur.execute(sql.SQL('DROP DATABASE {}').format(sql.Identifier(name)))
        control.close()


if __name__ == '__main__': run()
