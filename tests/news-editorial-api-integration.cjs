const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {scratch}=require('./helpers/editorial-db.cjs');
test('editorial writes enforce roles, versions, review and atomic audit',async t=>{
 const ctx=await scratch();let sequelize;
 try{
 const file=path.resolve(__dirname,'../services/news-service/dist/editorial/service.js');assert(fs.existsSync(file),'editorial service must exist');
 const {createEditorialNews:create,updateEditorialNews:update,transitionEditorialNews:transition}=require(file);sequelize=require('../services/news-service/dist/config/db').default;
 await t.test('HTTP administration requires an active administrator and routes editorial operations',async()=>{
  const express=require('../services/news-service/node_modules/express');const auth=express();auth.get('/api/auth/profile',(req,res)=>res.json({data:{user:{id:req.headers.authorization==='Bearer admin'?1:2,email:'synthetic@example.invalid',rol:req.headers.authorization==='Bearer admin'?'admin':'usuario'}}}));
  const a=await new Promise(r=>{const s=auth.listen(0,'127.0.0.1',()=>r(s));});process.env.AUTH_SERVICE_URL=`http://127.0.0.1:${a.address().port}`;
  const app=express();app.use(express.json());app.use('/admin',require('../services/news-service/dist/admin/router').default);const s=await new Promise(r=>{const x=app.listen(0,'127.0.0.1',()=>r(x));});
  try{const post=async(token,path,body)=>fetch(`http://127.0.0.1:${s.address().port}/admin${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
   const body={titulo:'HTTP draft',contenido:'Synthetic'};assert.equal((await post(null,'/news',body)).status,401);assert.equal((await post('member','/news',body)).status,403);
   const response=await post('admin','/news',body);assert.equal(response.status,201);const n=(await response.json()).data;assert.equal((await post('admin',`/news/${n.id}/editorial`,{action:'submit',expected_version:1,reason:'Ready'})).status,200);
  }finally{await new Promise(r=>s.close(r));await new Promise(r=>a.close(r));}
 });
 const input={titulo:'New article',contenido:'Synthetic content',url:'https://example.invalid/Story?a=1#top',tema_id:1,fuente_id:1};
 await assert.rejects(create(input,2),e=>e.status===403);
 const news=await create(input,1);assert.equal(news.editorial_state,'draft');
 await assert.rejects(create({...input,url:'https://EXAMPLE.invalid:443/Story?a=1#other'},1),e=>e.status===409);
 await create({...input,url:'https://example.invalid/Story?a=2'},1);
 const concurrent=await Promise.allSettled([create({...input,url:'https://example.invalid/race'},1),create({...input,url:'https://example.invalid/race'},1)]);assert.equal(concurrent.filter(x=>x.status==='fulfilled').length,1);
 await assert.rejects(transition(news.id,{action:'publish',expected_version:1,reason:'Reviewed'},1),e=>e.status===409);
 const reviewed=await transition(news.id,{action:'submit',expected_version:1,reason:'Ready for review'},1);
 const pub=await transition(news.id,{action:'publish',expected_version:reviewed.editorial_version,reason:'Checked original source'},1);assert.equal(pub.editorial_state,'published');assert.equal(pub.editorial_reviewed_version,pub.editorial_version);
 const count=async()=>(await ctx.db.query('SELECT count(*)::int n FROM news_editorial_events WHERE noticia_id=$1',[news.id])).rows[0].n;
 const before=await count();await transition(news.id,{action:'publish',expected_version:reviewed.editorial_version,reason:'Checked original source'},1);assert.equal(await count(),before);
 await assert.rejects(update(news.id,{titulo:'stale',expected_version:1,reason:'Change'},1),e=>e.status===409);
 await ctx.db.query("INSERT INTO clasificacion_noticias(noticia_id,resultado,content_version) VALUES($1,'falsa',1)",[news.id]);
 const changed=await update(news.id,{contenido:'Corrected text',expected_version:pub.editorial_version,reason:'Correction'},1);assert.equal(changed.editorial_state,'draft');assert.equal(changed.content_version,2);assert.equal(changed.editorial_reviewed_at,null);
 const oldCount=await count();await assert.rejects(update(news.id,{tema_id:999,expected_version:changed.editorial_version,reason:'Bad topic'},1),e=>e.status===400);assert.equal(await count(),oldCount);
 const ready=await transition(news.id,{action:'submit',expected_version:changed.editorial_version,reason:'Review correction'},1);
 const race=await Promise.allSettled([transition(news.id,{action:'publish',expected_version:ready.editorial_version,reason:'Reviewed correction'},1),update(news.id,{contenido:'Concurrent correction',expected_version:ready.editorial_version,reason:'New evidence'},1)]);
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(race.find(r=>r.status==='rejected').reason.status,409);
 assert.equal(await count(),oldCount+2,'only the winning operation has an audit event');
 await t.test('report resolution requires a note and decreases trust only once',async()=>{
  const {resolveReport}=require('../services/news-service/dist/admin/write');
  await ctx.db.query("INSERT INTO reportes_fuente(id,fuente_id,usuario_id,motivo) VALUES(1,1,2,'Synthetic report')");
  await assert.rejects(resolveReport(1,'revisado',1,''),e=>e.status===400);
  await Promise.all([resolveReport(1,'revisado',1,'Source checked'),resolveReport(1,'revisado',1,'Source checked')]);
  assert.equal(Number((await ctx.db.query('SELECT confiabilidad FROM fuentes WHERE id=1')).rows[0].confiabilidad),0.4);
  const row=(await ctx.db.query('SELECT resolution_note,resolved_by FROM reportes_fuente WHERE id=1')).rows[0];assert.equal(row.resolution_note,'Source checked');assert.equal(row.resolved_by,1);
  assert.equal((await ctx.db.query('SELECT count(*)::int n FROM source_report_events')).rows[0].n,1);
  const legacy=require('../services/news-service/dist/controllers/reportController');let status=200;const res={status(n){status=n;return this;},json(){return this;}};
  await legacy.updateReportStatus({user:{id:1,rol:'admin'},params:{id:'1'},body:{estado:'revisado',resolution_note:'Source checked'}},res);assert.equal(status,200);
  assert.equal(Number((await ctx.db.query('SELECT confiabilidad FROM fuentes WHERE id=1')).rows[0].confiabilidad),0.4,'legacy route must not reduce trust twice');
 });
 await ctx.db.query("UPDATE usuarios SET rol='usuario' WHERE id=1");await assert.rejects(update(news.id,{titulo:'revoked',expected_version:changed.editorial_version,reason:'No'},1),e=>e.status===403);
 }finally{if(sequelize)await sequelize.close();await ctx.close();}
});
