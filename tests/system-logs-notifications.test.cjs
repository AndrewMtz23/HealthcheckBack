const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {scratch}=require('./helpers/editorial-db.cjs');
test('delivery summary describes SMTP acceptance without claiming delivery or logging empty polls',async()=>{
 process.env.AUDIT_ENABLED='true';
 try{
  const events=[];const client={query:async(_sql,args)=>events.push(JSON.parse(args[0]))};
  const {DeliveryAudit}=require('../services/notification-service/src/services/audit');
  const empty=new DeliveryAudit(client);await empty.finish();assert.equal(events.length,0);
  const audit=new DeliveryAudit(client);await audit.start();await audit.start();audit.record('sent');audit.record('failed');await audit.finish();
  assert.equal(events.length,2);assert.equal(events[0].request_id,events[1].request_id);
  assert.equal(events[1].outcome,'failure');assert.equal(events[1].metadata.transport_status,'accepted_by_smtp');assert.equal(events[1].metadata.delivered,undefined);
 }finally{delete process.env.AUDIT_ENABLED;}
});
test('announcement lifecycle and repeated reads produce atomic audit events without sending email',async()=>{
 const ctx=await scratch();process.env.AUDIT_ENABLED='true';let db,server;
 try{
  await ctx.db.query(fs.readFileSync('services/notification-service/sql/system-announcements.sql','utf8'));
  const express=require('../services/auth-service/node_modules/express');
  db=require('../services/auth-service/dist/config/db').default;
  const User=require('../services/auth-service/dist/models/User').default;
  const app=express();app.use(express.json());app.use(require('../services/auth-service/dist/config/passport').default.initialize());
  app.use('/announcements',require('../services/auth-service/dist/admin/announcements').default);
  app.use(require('../services/auth-service/dist/profile/inboxRoutes').default);
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const token=require('../services/auth-service/dist/utils/jwt').generateToken(await User.findByPk(1));
  async function call(path,method='POST',body={}){
   const r=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(2500)});
   const data=await r.json();assert(r.ok,JSON.stringify(data));return data.data;
  }
  const notice=await call('/announcements','POST',{title:'Synthetic',body:'Testing only',kind:'informativo'});
  await call(`/announcements/${notice.id}/publish`);await call(`/announcements/${notice.id}/publish`);
  await call(`/system-announcements/${notice.id}/read`);await call(`/system-announcements/${notice.id}/read`);
  const count=async action=>(await ctx.db.query('SELECT count(*)::int AS n FROM system_logs WHERE action=$1',[action])).rows[0].n;
  assert.equal(await count('ANNOUNCEMENT_CREATE'),1);assert.equal(await count('ANNOUNCEMENT_PUBLISH'),1);assert.equal(await count('NOTIFICATION_READ'),1);
  assert.equal((await ctx.db.query("SELECT count(*)::int AS n FROM system_announcement_emails WHERE state='sent'")).rows[0].n,0);
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}delete process.env.AUDIT_ENABLED;if(db)await db.close();await ctx.close();}
});
