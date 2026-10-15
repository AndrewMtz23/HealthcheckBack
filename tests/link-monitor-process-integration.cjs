const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {spawn}=require('node:child_process');const {randomUUID}=require('node:crypto');const net=require('node:net');
const {Client}=require('../services/news-service/node_modules/pg');
test('compiled monitor preserves interrupted runs and diagnostic startup does not execute them',{timeout:30000},async()=>{
 const settings={host:'127.0.0.1',port:5548,user:'monitor_test',database:'postgres'};const control=new Client(settings);await control.connect();
 const expected=path.resolve(__dirname,'../../.healthcheck-logs/link-monitor/pg').toLowerCase();assert.equal(path.resolve((await control.query('SHOW data_directory')).rows[0].data_directory).toLowerCase(),expected);
 const dbName='link_monitor_test_process_'+randomUUID().replaceAll('-','');let db,child;
 const stop=async()=>{if(!child||child.exitCode!==null)return;const p=child;child=null;await new Promise(resolve=>{p.once('exit',resolve);p.kill();});};
 const wait=async(fn)=>{const until=Date.now()+6000;let last;while(Date.now()<until){try{const value=await fn();if(value)return value;}catch(e){last=e;}await new Promise(r=>setTimeout(r,30));}throw last||Error('Process state timeout');};
 try{
  await control.query(`CREATE DATABASE ${dbName}`);db=new Client({...settings,database:dbName});await db.connect();
  await db.query("CREATE TABLE noticias(id bigint PRIMARY KEY,titulo text,url text);INSERT INTO noticias SELECT i,'Synthetic', 'http://127.0.0.1/article-'||i FROM generate_series(1,10) i");
  await db.query(fs.readFileSync(path.resolve(__dirname,'../services/link-monitor-service/sql/001_link_monitor.sql'),'utf8'));
  const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
  const base=`http://127.0.0.1:${port}`;
  const launch=async diagnostic=>{child=spawn(path.resolve(__dirname,'../services/link-monitor-service/bin/link-monitor.exe'),[],{windowsHide:true,stdio:'ignore',env:{...process.env,PORT:String(port),LINK_MONITOR_HOST:'127.0.0.1',LINK_MONITOR_INTERNAL_TOKEN:'synthetic-process-test',DB_HOST:settings.host,DB_PORT:String(settings.port),DB_NAME:dbName,DB_USER:settings.user,DB_PASSWORD:'',PGSSLMODE:'disable',PGOPTIONS:'',HEALTHCHECK_DIAGNOSTIC:diagnostic?'1':'0'}});await wait(async()=>{const r=await fetch(base+'/health',{signal:AbortSignal.timeout(1000)});await r.body.cancel();return r.status===200;});};
  const post=()=>fetch(base+'/internal/link-monitor/runs',{method:'POST',headers:{Authorization:'Bearer synthetic-process-test','Content-Type':'application/json'},body:'{"requested_by":1}'});
  await launch(false);let response=await post();assert.equal(response.status,202);const id=(await response.json()).data.run.id;
  await wait(async()=> (await db.query('SELECT state FROM link_monitor_runs WHERE id=$1',[id])).rows[0].state==='running');await stop();
  await launch(false);await wait(async()=> (await db.query('SELECT state FROM link_monitor_runs WHERE id=$1',[id])).rows[0].state==='interrupted');assert.equal((await db.query('SELECT count(*)::int AS n FROM link_monitor_runs')).rows[0].n,1);await stop();
  await launch(true);response=await post();assert.equal(response.status,503);await response.body.cancel();assert.equal((await db.query('SELECT state FROM link_monitor_runs WHERE id=$1',[id])).rows[0].state,'interrupted');
 }finally{await stop();if(db)await db.end();await control.query(`DROP DATABASE IF EXISTS ${dbName}`);await control.end();}
});
