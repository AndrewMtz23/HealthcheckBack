import unittest
from flask import Flask
from database.db import db
from database.models import Noticia, ClasificacionNoticia, ModeloML, Usuario
from utils.db_utils import get_cached_analysis, save_complete_analysis

class EditorialVersions(unittest.TestCase):
    def setUp(self):
        self.app=Flask(__name__)
        self.app.config.update(SQLALCHEMY_DATABASE_URI='sqlite://',SQLALCHEMY_TRACK_MODIFICATIONS=False)
        db.init_app(self.app)
        self.context=self.app.app_context(); self.context.push(); db.create_all()
        db.session.add_all([Usuario(id=1,email='one@example.invalid',nombre='One'),Usuario(id=2,email='two@example.invalid',nombre='Two'),ModeloML(id=1,nombre='Synthetic',version='test')]);db.session.commit()
    def tearDown(self):
        db.session.remove();db.drop_all();self.context.pop()
    def test_imported_analysis_is_private_versioned_and_not_reused_after_correction(self):
        args=dict(titulo='Original',contenido='Original synthetic text',url='https://example.invalid/story',fecha_publicacion=None,fuente_url=None,tema_nombre=None,tema_id=None,keywords=[],modelo_id=1,resultado='falsa',confianza=80,explicacion='Synthetic',usuario_id=1)
        saved=save_complete_analysis(**args);news=db.session.get(Noticia,saved['noticia_id'])
        self.assertEqual(getattr(news,'editorial_state',None),'draft')
        self.assertEqual(db.session.get(ClasificacionNoticia,saved['clasificacion_id']).content_version,1)
        self.assertIsNone(get_cached_analysis(args['url'],None,1,2))
        news.contenido='Corrected text';news.content_version=2;db.session.commit()
        self.assertIsNone(get_cached_analysis(args['url'],None,1,1))
        again=save_complete_analysis(**args)
        self.assertNotEqual(again['noticia_id'],news.id)
        self.assertEqual(db.session.get(Noticia,news.id).contenido,'Corrected text')
    def test_withdrawn_article_is_not_returned_by_analysis_cache(self):
        news=Noticia(titulo='Withdrawn',contenido='Private text',url='https://example.invalid/removed')
        db.session.add(news);db.session.flush();news.editorial_state='withdrawn'
        db.session.add(ClasificacionNoticia(noticia_id=news.id,modelo_id=1,resultado='falsa',content_version=1));db.session.commit()
        self.assertIsNone(get_cached_analysis(news.url,None,1,1))

if __name__=='__main__': unittest.main()
