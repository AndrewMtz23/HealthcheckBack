const {test}=require('node:test'),assert=require('node:assert/strict');const {scratch}=require('./helpers/editorial-db.cjs');
test('public HTTP surfaces exclude drafts and withdrawn content and select current analysis',async()=>{
 const ctx=await scratch();let server,sequelize;try{
 const express=require('../services/news-service/node_modules/express');sequelize=require('../services/news-service/dist/config/db').default;
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={id:2,rol:'usuario',email:'member@example.invalid'};next();});
 const news=require('../services/news-service/dist/controllers/newsController'),search=require('../services/news-service/dist/controllers/searchController'),history=require('../services/news-service/dist/controllers/historyController'),inter=require('../services/news-service/dist/controllers/interactionController'),stats=require('../services/news-service/dist/controllers/statsController');
 app.get('/news',news.getNewsFeed);app.get('/news/:id',news.getNewsById);app.get('/search',search.searchNews);app.get('/history',history.getUserHistory);app.get('/interactions',inter.getUserInteractions);app.get('/stats',stats.getGeneralStats);app.get('/counts/:noticiaId',inter.getInteractionCounts);app.get('/status/:noticiaId',inter.getInteractionStatus);
 server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});const call=async p=>{const r=await fetch(`http://127.0.0.1:${server.address().port}${p}`);return {status:r.status,body:await r.json()};};
 await ctx.db.query("INSERT INTO noticias(id,titulo,contenido,url,fecha_publicacion,tema_id,fuente_id,editorial_origin) VALUES(1,'Hidden secret','Private body','https://example.invalid/a',now(),1,1,'manual'); INSERT INTO historial_consultas(usuario_id,noticia_id) VALUES(2,1); INSERT INTO interacciones_noticia(usuario_id,noticia_id,tipo_interaccion) VALUES(2,1,'compartir')");
 assert.equal((await call('/news/1')).status,404);
 assert.equal((await call('/counts/1')).status,404);assert.equal((await call('/status/1')).status,404);
 assert.equal((await call('/news')).body.data.total,0);assert.equal((await call('/search')).body.data.total,0);
 for(const p of ['/history','/interactions','/stats']){const r=await call(p);assert.equal(r.status,200);assert(!JSON.stringify(r.body).includes('Hidden secret'));assert(!JSON.stringify(r.body).includes('Private body'));}
 await ctx.db.query("UPDATE noticias SET editorial_state='published' WHERE id=1; INSERT INTO clasificacion_noticias(noticia_id,resultado,content_version,fecha_clasificacion) VALUES(1,'falsa',1,'2026-01-01'),(1,'verdadera',1,'2026-01-02')");
 assert.equal((await call('/news/1')).status,200);assert.equal((await call('/search?clasificacion=falsa')).body.data.total,0);assert.equal((await call('/search?clasificacion=verdadera')).body.data.total,1);
 await ctx.db.query("UPDATE noticias SET editorial_state='withdrawn' WHERE id=1");assert.equal((await call('/news/1')).status,410);
 for(const p of ['/history','/interactions','/stats']){const r=await call(p);assert(!JSON.stringify(r.body).includes('Hidden secret'));assert(!JSON.stringify(r.body).includes('Private body'));}
 }finally{if(server)await new Promise(r=>server.close(r));if(sequelize)await sequelize.close();await ctx.close();}
});
