const {test}=require('node:test'),assert=require('node:assert/strict');
const {AnnouncementDeliveryWorker}=require('../services/notification-service/src/services/announcement-delivery-worker');
test('announcement delivery stays paused when versioned tables are absent',async()=>{
 const queries=[];const pool={connect:async()=>({query:async(sql)=>{queries.push(sql);if(sql.includes('to_regclass'))return {rows:[{announcements:null,emails:null}]};return {rows:[]};},release(){}})};
 const worker=new AnnouncementDeliveryWorker({pool,send:async()=>{throw Error('SMTP must not run');}});
 assert.deepEqual(await worker.runOnce(),{ready:false});assert.equal(queries.length,2);
});
test('worker lock contention does not publish or send',async()=>{
 const pool={connect:async()=>({query:async(sql)=>sql.includes('to_regclass')?{rows:[{announcements:'system_announcements',audience:'system_announcement_audience',reads:'system_announcement_reads',emails:'system_announcement_emails',totals:'system_announcement_email_totals'}]}:sql.includes('pg_try_advisory_lock')?{rows:[{locked:false}]}:{rows:[]},release(){}})};
 const worker=new AnnouncementDeliveryWorker({pool,send:async()=>{throw Error('should not send');}});
 assert.deepEqual(await worker.runOnce(),{ready:true,busy:true});
});
