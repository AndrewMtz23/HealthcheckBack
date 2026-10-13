// Writes only a uniquely named database in the verified local scratch PostgreSQL cluster.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{randomUUID}=require('node:crypto');
const {Client,Pool}=require('../services/auth-service/node_modules/pg');
const bcrypt=require('../services/auth-service/node_modules/bcryptjs');
const root=path.resolve(__dirname,'..'),instance=randomUUID(),database=`announcements_${randomUUID().replaceAll('-','')}`;
const cfg={host:'127.0.0.1',port:55432,user:'phase00',password:'unused'};const children=[];let control,db,pool,created=false,checks=0;
const secret='synthetic-system-announcement-integration-secret';
async function free(port){await new Promise((resolve,reject)=>{const server=require('node:net').createServer();server.once('error',reject);server.listen(port,'127.0.0.1',()=>server.close(resolve));});}
async function main(){try{
 await free(13005);control=new Client({...cfg,database:'postgres'});await control.connect();
 const dataDir=(await control.query('SHOW data_directory')).rows[0].data_directory;
 assert.equal(path.resolve(dataDir).toLowerCase(),path.resolve(root,'../.healthcheck-logs/phase00-pg').toLowerCase(),'Refuse to touch any PostgreSQL cluster outside the verified scratch directory');
 await control.query(`CREATE DATABASE ${database}`);created=true;db=new Client({...cfg,database});await db.connect();
 await db.query(fs.readFileSync(path.join(root,'db.sql'),'utf8'));
 await db.query(fs.readFileSync(path.join(root,'services/notification-service/sql/system-announcements.sql'),'utf8'));
 const hash=await bcrypt.hash('Synthetic-announcement-123!',10);
 await db.query('INSERT INTO usuarios(id,nombre,email,contrasena,rol,activo) VALUES(1,$1,$2,$3,$4,true),(2,$5,$6,$3,$7,true),(3,$8,$9,$3,$7,false)', ['Synthetic Admin','admin@example.invalid',hash,'admin','Synthetic Member','member@example.invalid','usuario','Inactive','inactive@example.invalid']);
 await db.query("SELECT setval('usuarios_id_seq',10)");
 const env={...process.env,DB_HOST:cfg.host,DB_PORT:String(cfg.port),DB_NAME:database,DB_USER:cfg.user,DB_PASSWORD:cfg.password,JWT_SECRET:secret,GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',NODE_ENV:'test',HEALTHCHECK_DIAGNOSTIC:'1',HEALTHCHECK_TEST_INSTANCE:instance,PORT:'13005',FRONTEND_URL:'http://localhost:3000'};
 const log=fs.openSync(path.resolve(root,`../.healthcheck-logs/system-announcements-${instance}.log`),'w');
 const child=spawn(process.execPath,['-r',path.join(root,'tests/support/http-instance.cjs'),'dist/app.js'],{cwd:path.join(root,'services/auth-service'),env,stdio:['ignore',log,log],windowsHide:true});children.push(child);fs.closeSync(log);
 let ready=false;for(let i=0;i<200;i++){try{const r=await fetch('http://127.0.0.1:13005/api/health');if(r.headers.get('x-healthcheck-test-instance')===instance){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert(ready,'Synthetic Auth API did not start');
 const login=async email=>{const r=await fetch('http://127.0.0.1:13005/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,contrasena:'Synthetic-announcement-123!'})});assert.equal(r.status,200);return (await r.json()).data.token;};
 const adminToken=await login('admin@example.invalid'),memberToken=await login('member@example.invalid');
 async function call(route,{token=adminToken,method='GET',body}={}){const r=await fetch(`http://127.0.0.1:13005/api/auth${route}`,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:body===undefined?undefined:JSON.stringify(body)});const payload=await r.json();checks++;return {status:r.status,data:payload.data,payload};}
 const draft={title:'Synthetic maintenance',body:'Short interruption',kind:'mantenimiento',publish_at:null,expires_at:null,maintenance_start_at:'2026-10-13T00:00:00Z',maintenance_end_at:'2026-10-13T02:00:00Z'};
 assert.equal((await call('/admin/announcements',{token:memberToken,method:'POST',body:draft})).status,403);
 assert.equal((await call('/admin/announcements',{method:'POST',body:{...draft,title:' '}})).status,400);
 const createdDraft=await call('/admin/announcements',{method:'POST',body:draft});assert.equal(createdDraft.status,201);
 const preview=await call(`/admin/announcements/${createdDraft.data.id}/preview`);assert.equal(preview.data.eligibleAccounts,2);
 const published=await call(`/admin/announcements/${createdDraft.data.id}/publish`,{method:'POST',body:{}});assert.equal(published.status,200);assert.equal(published.data.audience_count,2);
 await call(`/admin/announcements/${createdDraft.data.id}/publish`,{method:'POST',body:{}});
 let rows=await db.query('SELECT state,count(*)::int AS n FROM system_announcement_emails WHERE announcement_id=$1 GROUP BY state',[createdDraft.data.id]);assert.deepEqual(rows.rows.map(r=>[r.state,r.n]),[['queued',2]]);
 pool=new Pool({...cfg,database});const sent=[];const {AnnouncementDeliveryWorker}=require('../services/notification-service/src/services/announcement-delivery-worker');
 const worker=new AnnouncementDeliveryWorker({pool,send:async(user,notice,id)=>{sent.push({user,notice,id});return {accepted:[user.email],rejected:[]};}});
 assert.equal((await worker.runOnce()).ready,true);assert.equal(sent.length,2);assert.equal(new Set(sent.map(x=>x.id)).size,2);
 rows=await db.query('SELECT state,count(*)::int AS n FROM system_announcement_emails WHERE announcement_id=$1 GROUP BY state',[createdDraft.data.id]);assert.deepEqual(rows.rows.map(r=>[r.state,r.n]),[['sent',2]]);
 let inbox=await call('/inbox?limit=5&page=1',{token:memberToken});assert.equal(inbox.data.items.length,1);assert.equal(inbox.data.unread_count,1);
 assert.equal((await call(`/system-announcements/${createdDraft.data.id}/read`,{token:memberToken,method:'POST',body:{}})).status,200);
 inbox=await call('/inbox?limit=5&page=1',{token:memberToken});assert.equal(inbox.data.unread_count,0);
 await db.query("INSERT INTO usuarios(id,nombre,email,contrasena,rol,activo) VALUES(4,'Late Member','late@example.invalid',$1,'usuario',true)",[hash]);
 const scheduled=await call('/admin/announcements',{method:'POST',body:{...draft,title:'Scheduled maintenance',publish_at:'2026-10-14T00:00:00Z'}});assert.equal(scheduled.status,201);
 assert.equal((await call(`/admin/announcements/${scheduled.data.id}/schedule`,{method:'POST',body:{publish_at:'2026-10-14T00:00:00Z'}})).status,200);
 await db.query('UPDATE system_announcements SET publish_at=now()-interval \'1 minute\' WHERE id=$1',[scheduled.data.id]);
 await worker.runOnce({deliver:false});const due=(await db.query('SELECT status,audience_count FROM system_announcements WHERE id=$1',[scheduled.data.id])).rows[0];assert.equal(due.status,'published');assert.equal(due.audience_count,3);
 const totals=await db.query("SELECT state,total::int FROM system_announcement_email_totals WHERE announcement_id=$1 ORDER BY state",[scheduled.data.id]);assert(totals.rows.some(r=>r.state==='queued'&&r.total===3));
 const active=await db.query("UPDATE system_announcements SET maintenance_start_at=now()-interval '1 minute',maintenance_end_at=now()+interval '20 minutes' WHERE id=$1",[scheduled.data.id]);assert.equal(active.rowCount,1);
 const banner=await call('/system-announcements/active',{token:memberToken});assert(banner.data.some(item=>item.id===scheduled.data.id));
 console.log(`PASS: ${checks} isolated Auth API checks; admin authorization, validation, audience snapshot, idempotent publish, simulated per-account SMTP, read ownership, scheduled publish and maintenance visibility.`);
}finally{
 for(const child of children)child.kill();if(pool)await pool.end();if(db)await db.end();
 if(created){const cleanup=new Client({...cfg,database:'postgres'});await cleanup.connect();await cleanup.query(`DROP DATABASE ${database} WITH (FORCE)`);await cleanup.end();}
 if(control)await control.end();
}}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
