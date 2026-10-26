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
test('an audit failure rolls back an unattempted announcement claim',async()=>{
 process.env.AUDIT_ENABLED='true';let state='queued',snapshot,sends=0;
 const client={release(){},async query(sql){
  if(sql==='BEGIN'){snapshot=state;return {rows:[]};}
  if(sql==='ROLLBACK'){if(snapshot)state=snapshot;snapshot=null;return {rows:[]};}
  if(sql==='COMMIT'){snapshot=null;return {rows:[]};}
  if(sql.includes('to_regclass'))return {rows:[{announcements:1,audience:1,reads:1,emails:1,totals:1}]};
  if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};
  if(sql.includes("SET state='sending'")){state='sending';return {rows:[{announcement_id:1,usuario_id:1}]};}
  if(sql.includes('record_system_log'))throw Error('Unavailable');
  return {rows:[]};
 }};
 try{
  const {AnnouncementDeliveryWorker}=require('../services/notification-service/src/services/announcement-delivery-worker');
  const worker=new AnnouncementDeliveryWorker({pool:{connect:async()=>client},send:async()=>{sends++;}});
  worker.publishDue=async()=>{};
  await assert.rejects(()=>worker.runOnce(),/AUDIT_WRITE_FAILED/);
  assert.equal(state,'queued');assert.equal(sends,0);
 }finally{delete process.env.AUDIT_ENABLED;}
});
