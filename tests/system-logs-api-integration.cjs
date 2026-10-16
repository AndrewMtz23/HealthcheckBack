const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {scratch}=require('./helpers/editorial-db.cjs');
test('Logs API enforces current admin and applies shared filters before pagination',async()=>{
 const ctx=await scratch();process.env.AUDIT_ENABLED='true';let db,server;const fetchOriginal=global.fetch;
 try{
  db=require('../services/news-service/dist/config/db').default;
  const fixture=require('../contracts/audit/fixtures.json').valid;
  for(let n=0;n<30;n++){
   const value={...fixture,event_key:randomUUID(),request_id:randomUUID(),occurred_at:'2026-10-17T05:59:59Z',user_id:1,actor_type:'user',actor_role:'admin',description:n===0?'Needle beyond page':'Synthetic'};
   await ctx.db.query('SELECT record_system_log($1::jsonb)',[JSON.stringify(value)]);
  }
  process.env.AUTH_SERVICE_URL='http://auth.test';
  global.fetch=async(url,options)=>String(url).startsWith('http://auth.test/')?new Response(JSON.stringify({data:{user:{id:options.headers.Authorization==='Bearer member'?2:1,rol:options.headers.Authorization==='Bearer member'?'usuario':'admin',email:'synthetic@example.invalid'}}}),{status:200}):fetchOriginal(url,options);
  const express=require('../services/news-service/node_modules/express'),app=express();app.use('/admin',require('../services/news-service/dist/admin/router').default);
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const range='startDate=2026-10-16&endDate=2026-10-16';
  const call=(suffix='',token='admin')=>fetchOriginal(`http://127.0.0.1:${server.address().port}/admin/logs${suffix}`,{headers:token?{Authorization:`Bearer ${token}`}:{}});
  assert.equal((await call('',null)).status,401);assert.equal((await call('','member')).status,403);
  const response=await call('?'+range);assert.equal(response.status,200);const list=(await response.json()).data;
  assert.equal(list.total,30);assert.equal(list.items.length,25);
  const search=(await (await call('?'+range+'&q=Needle')).json()).data;assert.equal(search.total,1);
  const summary=(await (await call('/summary?'+range)).json()).data;assert.equal(summary.total,list.total);
  const trend=(await (await call('/trend?'+range)).json()).data;assert(trend.topActions.length<=6);assert.equal(trend.series.reduce((n,x)=>n+x.count,0),30);
  assert.equal((await call('/'+list.items[0].id)).status,200);
  assert.equal((await ctx.db.query("SELECT count(*)::int AS n FROM system_logs WHERE action='LOG_DETAIL_VIEW'")).rows[0].n,1);
  const bulk={...fixture,occurred_at:'2026-10-17T05:59:59Z',description:'Bulk export fixture'};
  await ctx.db.query("SELECT record_system_log($1::jsonb || jsonb_build_object('event_key',gen_random_uuid(),'request_id',gen_random_uuid())) FROM generate_series(1,5000)",[JSON.stringify(bulk)]);
  const exported=await call('/export?'+range+'&q=Bulk');assert.equal(exported.status,200);assert(exported.headers.get('content-type').includes('spreadsheetml'));
  await ctx.db.query('SELECT record_system_log($1::jsonb)',[JSON.stringify({...bulk,event_key:randomUUID(),request_id:randomUUID()})]);
  assert.equal((await call('/export?'+range+'&q=Bulk')).status,422);
  assert.equal((await ctx.db.query("SELECT count(*)::int AS n FROM system_logs WHERE action='LOG_EXPORT'")).rows[0].n,1);
  await ctx.db.query("UPDATE usuarios SET rol='usuario' WHERE id=1");assert.equal((await call('/catalog')).status,403);
 }finally{global.fetch=fetchOriginal;delete process.env.AUDIT_ENABLED;if(server)await new Promise(r=>server.close(r));if(db)await db.close();await ctx.close();}
});
