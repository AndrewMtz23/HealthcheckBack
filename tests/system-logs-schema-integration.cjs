const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {scratch}=require('./helpers/editorial-db.cjs');
test('audit schema is idempotent, transactional and retains events when an actor is deleted',async()=>{
 const migration=fs.readFileSync(path.join(__dirname,'../services/news-service/sql/system-logs.sql'),'utf8');
 const ctx=await scratch();try{
  await ctx.db.query(migration);await ctx.db.query(migration);
  const event={...require('../contracts/audit/fixtures.json').valid,user_id:2};
  const write=async value=>(await ctx.db.query('SELECT record_system_log($1::jsonb)::text AS id',[JSON.stringify(value)])).rows[0].id;
  const id=await write(event);assert.equal(typeof id,'string');assert.equal(await write(event),id);
  for(const patch of [{description:{secret:'wrong type'}},{user_agent:123},{entity_id:12},{ip_address:'127.0.0.1/24'}])await assert.rejects(write({...event,event_key:require('crypto').randomUUID(),...patch}),/audit/i);
  await assert.rejects(write({...event,description:'Changed payload'}),/conflict/i);
  await assert.rejects(write({...event,event_key:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',metadata:{password:'secret'}}),/audit/i);
  await ctx.db.query('BEGIN');await write({...event,event_key:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'});await ctx.db.query('ROLLBACK');
  assert.equal((await ctx.db.query('SELECT count(*)::int AS n FROM system_logs')).rows[0].n,1);
  await ctx.db.query('DELETE FROM usuarios WHERE id=2');
  const log=(await ctx.db.query('SELECT * FROM system_logs WHERE id=$1',[id])).rows[0];
  assert.equal(log.user_id,null);assert.equal(log.actor_type,'user');assert.equal(log.sensitivity,'normal');
  assert.equal(await write(event),id);
  const historical={...event,event_key:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',user_id:null,actor_type:'anonymous',actor_role:null,origin:'imported',occurred_at:null,source_reference:'legacy-1',metadata:{date_uncertain:true,original_date:'unknown'}};
  await write(historical);
  assert.equal((await ctx.db.query('SELECT occurred_at FROM system_logs WHERE event_key=$1',[historical.event_key])).rows[0].occurred_at,null);
 }finally{await ctx.close();}
});
