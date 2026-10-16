const {test}=require('node:test'),assert=require('node:assert/strict');
const {scratch}=require('./helpers/editorial-db.cjs');
test('editorial events are atomic, conflicts and retries do not fabricate successes',async()=>{
 const ctx=await scratch();process.env.AUDIT_ENABLED='true';let db;
 try{
  db=require('../services/news-service/dist/config/db').default;
  const service=require('../services/news-service/dist/editorial/service');
  let news=await service.createEditorialNews({titulo:'Synthetic title',contenido:'Synthetic content'},1);
  const count=async action=>(await ctx.db.query('SELECT count(*)::int AS n FROM system_logs WHERE action=$1',[action])).rows[0].n;
  assert.equal(await count('NEWS_CREATE'),1);
  news=await service.transitionEditorialNews(news.id,{action:'submit',reason:'Review',expected_version:news.editorial_version},1);
  const input={action:'publish',reason:'Approved',expected_version:news.editorial_version};
  news=await service.transitionEditorialNews(news.id,input,1);
  await service.transitionEditorialNews(news.id,input,1);assert.equal(await count('NEWS_PUBLISH'),1);
  await assert.rejects(()=>service.transitionEditorialNews(news.id,{...input,reason:'Conflicting'},1),e=>e.status===409);
  assert.equal(await count('NEWS_PUBLISH'),1);
  const write=require('../services/news-service/dist/admin/write');
  await write.saveContent('sources',1,{nombre:'Source updated'},1);
  assert.equal(await count('SOURCE_UPDATE'),1);
  const report=(await ctx.db.query("INSERT INTO reportes_fuente(usuario_id,fuente_id,motivo) VALUES(2,1,'Synthetic') RETURNING id")).rows[0];
  await write.resolveReport(report.id,'desestimado',1,'Synthetic reason');
  await write.resolveReport(report.id,'desestimado',1,'Synthetic reason');
  assert.equal(await count('REPORT_RESOLVE'),1);
  const interactions=require('../services/news-service/dist/controllers/interactionController');
  const reports=require('../services/news-service/dist/controllers/reportController');
  let status;const res={status(n){status=n;return this;},json(){}};
  const req={headers:{},socket:{remoteAddress:'127.0.0.1'},user:{id:2,rol:'usuario'},body:{noticia_id:news.id,tipo_interaccion:'compartir'}};
  await interactions.createOrUpdateInteraction(req,res);assert.equal(status,201);
  await interactions.createOrUpdateInteraction(req,res);assert.equal(status,200);
  assert.equal(await count('NEWS_INTERACTION'),1);
  await reports.createReport({...req,body:{fuente_id:1,motivo:'Synthetic report'}},res);assert.equal(status,201);
  assert.equal(await count('REPORT_CREATE'),1);
  const total=(await ctx.db.query('SELECT count(*)::int AS n FROM noticias')).rows[0].n;
  await ctx.db.query('ALTER TABLE system_logs RENAME TO unavailable_audit_table');
  await assert.rejects(()=>service.createEditorialNews({titulo:'Rollback',contenido:'Must rollback'},1));
  assert.equal((await ctx.db.query('SELECT count(*)::int AS n FROM noticias')).rows[0].n,total);
  assert.equal((await ctx.db.query("SELECT count(*)::int AS n FROM news_editorial_events WHERE after_data->>'titulo'='Rollback'")).rows[0].n,0);
 }finally{delete process.env.AUDIT_ENABLED;if(db)await db.close();await ctx.close();}
});
