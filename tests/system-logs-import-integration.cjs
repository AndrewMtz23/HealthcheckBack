const {test}=require('node:test'),assert=require('node:assert/strict');
const {scratch}=require('./helpers/editorial-db.cjs');
test('historical import is read-only at source, idempotent and honest about uncertain dates',async()=>{
 const ctx=await scratch();
 try{
  const {importHistoricalLogs}=require('../scripts/import-system-logs.cjs');
  const news=(await ctx.db.query("INSERT INTO noticias(titulo,contenido) VALUES('Synthetic','Synthetic') RETURNING id")).rows[0];
  await ctx.db.query('INSERT INTO historial_consultas(usuario_id,noticia_id,fecha_consulta) VALUES(2,$1,$2)',[news.id,'2026-10-15 12:30:00']);
  const dry=await importHistoricalLogs({client:ctx.db});assert.equal(dry.candidates,1);assert.equal((await ctx.db.query('SELECT count(*)::int AS n FROM system_logs')).rows[0].n,0);
  const first=await importHistoricalLogs({client:ctx.db,dryRun:false}),second=await importHistoricalLogs({client:ctx.db,dryRun:false});
  assert.equal(first.inserted,1);assert.equal(second.inserted,0);
  const event=(await ctx.db.query('SELECT * FROM system_logs')).rows[0];assert.equal(event.occurred_at,null);assert.equal(event.ip_address,null);assert.equal(event.metadata.date_uncertain,true);assert.equal(event.metadata.original_date,'2026-10-15 12:30:00');
  assert.equal((await ctx.db.query('SELECT count(*)::int AS n FROM historial_consultas')).rows[0].n,1);
  const liveHistory=(await ctx.db.query('INSERT INTO historial_consultas(usuario_id,noticia_id) VALUES(1,$1) RETURNING id',[news.id])).rows[0];
  const live={...require('../contracts/audit/fixtures.json').valid,event_key:require('crypto').randomUUID(),action:'NEWS_VIEW',entity:'news',entity_id:String(news.id),source_reference:`historial_consultas:${liveHistory.id}`};
  await ctx.db.query('SELECT record_system_log($1::jsonb)',[JSON.stringify(live)]);
  assert.equal((await importHistoricalLogs({client:ctx.db,dryRun:false})).inserted,0);
  assert.equal((await ctx.db.query('SELECT count(*)::int AS n FROM system_logs')).rows[0].n,2);
 }finally{await ctx.close();}
});
