const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {Client,Pool}=require('../services/notification-service/node_modules/pg');
const {DeliveryWorker}=require('../services/notification-service/src/services/delivery-worker');
const root=path.resolve(__dirname,'..'),database='notifications_'+randomUUID().replaceAll('-','');
const cfg={host:'127.0.0.1',port:Number(process.env.EDITORIAL_TEST_PORT||55432),user:'phase00',password:'unused'};
Object.assign(process.env,{DB_HOST:cfg.host,DB_PORT:String(cfg.port),DB_USER:cfg.user,DB_PASSWORD:cfg.password,DB_NAME:database,NODE_ENV:'test',JWT_SECRET:'synthetic-notification-history-secret',GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',NOTIFICATION_DELIVERY_ENABLED:'false'});
test('durable notification delivery with isolated PostgreSQL, controlled clock and simulated provider',async t=>{
 const control=new Client({...cfg,database:'postgres'});let pool,created=false,server,sequelize,restored=false;
 const restoredDatabase=database+'_restore';
 let now=new Date('2026-10-09T14:59:00Z'),mode='ok',calls=[],identity=0;
 try {
  await control.connect();assert.equal(path.resolve((await control.query('SHOW data_directory')).rows[0].data_directory).toLowerCase(),path.resolve(root,'../.healthcheck-logs/phase00-pg').toLowerCase());
  await control.query(`CREATE DATABASE ${database}`);created=true;pool=new Pool({...cfg,database,max:6});
  await pool.query(fs.readFileSync(path.join(root,'db.sql'),'utf8'));
  await pool.query("ALTER TABLE noticias ALTER COLUMN editorial_state SET DEFAULT 'published'; ALTER TABLE noticias ALTER COLUMN editorial_origin SET DEFAULT 'manual'; ALTER TABLE clasificacion_noticias ALTER COLUMN content_version SET DEFAULT 1");
  const express=require('../services/auth-service/node_modules/express');
  const passport=require('../services/auth-service/dist/config/passport').default;
  sequelize=require('../services/auth-service/dist/config/db').default;
  const User=require('../services/auth-service/dist/models/User').default;
  const {generateToken}=require('../services/auth-service/dist/utils/jwt');
  const app=express();app.use(express.json());app.use(passport.initialize());app.use('/profile',require('../services/auth-service/dist/profile/routes').default);
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const history=async id=>{const token=generateToken(await User.findByPk(id));const response=await fetch(`http://127.0.0.1:${server.address().port}/profile/notifications`,{headers:{Authorization:`Bearer ${token}`}});assert.equal(response.status,200);return (await response.json()).data;};
  await pool.query("INSERT INTO usuarios(id,email,nombre,activo) VALUES(999,'legacy@example.invalid','Synthetic',true); INSERT INTO notificaciones(usuario_id,titulo,mensaje,tipo) VALUES(999,'Legacy','Synthetic','email')");
  const send=async(user,items,messageId)=>{calls.push({id:user.id,count:items.length,news:items.map(i=>i.noticia_id),messageId});if(mode==='temporary')throw {responseCode:451};if(mode==='timeout')throw {code:'ETIMEDOUT'};return {accepted:[user.email],rejected:[]};};
  const worker=()=>new DeliveryWorker({pool,send,now:()=>now});
  await t.test('unprepared schema blocks delivery and never writes legacy rows',async()=>{assert.equal((await worker().runOnce()).ready,false);assert.equal(calls.length,0);});
  await t.test('Auth history works without new schema and never promises legacy pending delivery',async()=>{const h=await history(999);assert.equal(h.schema_ready,false);assert.equal(h.delivery_enabled,false);assert.equal(h.items[0].delivery_state,'legacy');});
  await pool.query(fs.readFileSync(path.join(root,'services/notification-service/sql/notification-delivery.sql'),'utf8'));
  await pool.query("INSERT INTO temas(id,nombre,activo) VALUES(1,'Synthetic',true)");
  await pool.query("INSERT INTO noticias(id,titulo,contenido,tema_id,created_at) VALUES(1,'Synthetic news','Synthetic text',1,'2026-10-09 14:40:00'); INSERT INTO clasificacion_noticias(noticia_id,resultado,confianza,fecha_clasificacion) VALUES(1,'falsa',90,'2026-10-09 14:40:00')");
  const user=async(frequency='diaria',active=true,type='email')=>{const id=++identity;await pool.query('INSERT INTO usuarios(id,email,nombre,activo) VALUES($1,$2,$3,$4)',[id,`synthetic${id}@example.invalid`,'Synthetic',active]);await pool.query("INSERT INTO preferencias_usuario(usuario_id,recibir_notificaciones,frecuencia_notificaciones,tipo_notificacion,created_at) VALUES($1,true,$2,$3,'2026-10-01')",[id,frequency,type]);await pool.query('INSERT INTO preferencias_usuario_temas(usuario_id,tema_id) VALUES($1,1)',[id]);return id;};
  const state=async id=>(await pool.query('SELECT state,attempts FROM notification_deliveries WHERE usuario_id=$1 ORDER BY id DESC',[id])).rows[0];
  const profile=async(id,route,method,body)=>{const token=generateToken(await User.findByPk(id));const response=await fetch(`http://127.0.0.1:${server.address().port}/profile/${route}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});assert.equal(response.status,200);return response.json();};
  const daily=await user(),weekly=await user('semanal'),immediate=await user('inmediata');await user('diaria',false);await user('diaria',true,'sms');
  await t.test('frequency controls delivery, concurrent workers and restarts cannot resend',async()=>{
   await Promise.all([worker().runOnce(),worker().runOnce()]);assert.deepEqual(calls.map(c=>c.id),[immediate]);
   now=new Date('2026-10-09T15:00:00Z');await worker().runOnce();assert.deepEqual(calls.map(c=>c.id),[immediate,daily]);
   await worker().runOnce();assert.equal(calls.length,2);
   now=new Date('2026-10-12T15:00:00Z');await worker().runOnce();assert.equal(calls.at(-1).id,weekly);assert.equal(calls.length,3);
  });
  // Remaining fixtures use the just-completed weekly window.
  await t.test('unsubscribe, inactive account, changed frequency and removed topic cancel queued delivery',async()=>{
   for(const mutation of ['unsubscribe','inactive','frequency','topic']){
    const id=await user('semanal');await worker().runOnce({deliver:false});
    if(mutation==='unsubscribe')await pool.query('UPDATE preferencias_usuario SET recibir_notificaciones=false WHERE usuario_id=$1',[id]);
    if(mutation==='inactive')await pool.query('UPDATE usuarios SET activo=false WHERE id=$1',[id]);
    if(mutation==='frequency')await pool.query("UPDATE preferencias_usuario SET frecuencia_notificaciones='diaria' WHERE usuario_id=$1",[id]);
    if(mutation==='topic')await pool.query('DELETE FROM preferencias_usuario_temas WHERE usuario_id=$1',[id]);
    const count=calls.length;await worker().runOnce();assert.equal(calls.length,count);assert.equal((await state(id)).state,'cancelled');
   }
  });
  await t.test('retry attempts survive restart, respect backoff and stop after three refusals',async()=>{
   const id=await user('semanal');mode='temporary';await worker().runOnce();assert.deepEqual(await state(id),{state:'retry',attempts:1});
   const count=calls.length;await worker().runOnce();assert.equal(calls.length,count);
   now=new Date(now.getTime()+900000);await worker().runOnce();assert.equal((await state(id)).attempts,2);
   now=new Date(now.getTime()+3600000);await worker().runOnce();assert.deepEqual(await state(id),{state:'failed',attempts:3});
   await worker().runOnce();assert.equal((await state(id)).attempts,3);mode='ok';
  });
  await t.test('ambiguous SMTP and interrupted sending never retry automatically',async()=>{
   const id=await user('semanal');mode='timeout';await worker().runOnce();assert.equal((await state(id)).state,'uncertain');mode='ok';
   const other=await user('semanal');await worker().runOnce({deliver:false});await pool.query("UPDATE notification_deliveries SET state='sending',attempts=1 WHERE usuario_id=$1",[other]);
   const count=calls.length;await worker().runOnce();assert.equal(calls.length,count);assert.equal((await state(other)).state,'uncertain');
  });
  await t.test('deleting history does not delete deduplication and cannot cause a resend',async()=>{
   await pool.query('DELETE FROM notificaciones WHERE usuario_id=$1',[weekly]);const count=calls.length;
   await worker().runOnce();assert.equal(calls.length,count);
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM notification_delivery_items WHERE usuario_id=$1',[weekly])).rows[0].n,1);
  });
  await t.test('a missed immediate tick is caught up after restart without losing classified content',async()=>{
   const id=await user('inmediata');await worker().runOnce();
   const classified=new Date(now.getTime()+60000).toISOString();
   await pool.query("INSERT INTO noticias(id,titulo,contenido,tema_id) VALUES(2,'Catch up','Synthetic',1)");
   await pool.query("INSERT INTO clasificacion_noticias(noticia_id,resultado,confianza,fecha_clasificacion) VALUES(2,'falsa',90,$1)",[classified]);
   now=new Date(now.getTime()+3600000);await worker().runOnce();assert.equal(calls.filter(c=>c.id===id).length,1);
  });
  await t.test('Auth exposes durable failures without leaking another user history',async()=>{
   const failed=(await pool.query("SELECT usuario_id FROM notification_deliveries WHERE state='failed' LIMIT 1")).rows[0];
   const h=await history(failed.usuario_id);assert.equal(h.schema_ready,true);assert.equal(h.items[0].delivery_state,'failed');assert.equal(h.items[0].attempts,3);
   const own=(await pool.query('SELECT id FROM notificaciones WHERE usuario_id=$1',[failed.usuario_id])).rows.map(r=>r.id);
   assert(h.items.every(item=>own.includes(item.id)));assert.equal((await history(999)).items[0].delivery_state,'legacy');
  });
  await t.test('all due recipients are drained in the same tick, including recipient 21',async()=>{
   const ids=[];for(let i=0;i<21;i++)ids.push(await user('semanal'));
   await worker().runOnce();assert.equal(calls.filter(c=>ids.includes(c.id)).length,21);
  });
  await t.test('topic removal waits for the same account lock as delivery before it can confirm',async()=>{
   const id=await user('semanal'),token=generateToken(await User.findByPk(id));
   const lock=await pool.connect();let request,settled=false;
   try {
    await lock.query('BEGIN');await lock.query('SELECT id FROM usuarios WHERE id=$1 FOR UPDATE',[id]);
    request=fetch(`http://127.0.0.1:${server.address().port}/profile/topics/1`,{method:'DELETE',headers:{Authorization:`Bearer ${token}`}}).then(r=>{settled=true;return r;});
    let waiting=false;
    for(let i=0;i<100&&!settled;i++){
     waiting=(await pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock' AND query LIKE '%FROM usuarios%FOR UPDATE%'",[database])).rows[0].n>0;
     if(waiting)break;await new Promise(r=>setTimeout(r,10));
    }
    assert.equal(settled,false);assert.equal(waiting,true);
   } finally {await lock.query('ROLLBACK');lock.release();if(request)assert.equal((await request).status,200);}
   const count=calls.length;await worker().runOnce();assert.equal(calls.length,count);
  });
  await t.test('SMTP acceptance followed by failed database commit is held uncertain after restart',async()=>{
   const id=await user('semanal');let accepted=false,injected=false;
   const faultPool={async connect(){const client=await pool.connect();return {
    async query(sql,args){if(sql==='COMMIT'&&accepted&&!injected){injected=true;throw Error('Synthetic commit failure');}return client.query(sql,args);},
    release(error){client.release(error);},
   };}};
   const faulty=new DeliveryWorker({pool:faultPool,now:()=>now,send:async(u,items,messageId)=>{const result=await send(u,items,messageId);if(u.id===id)accepted=true;return result;}});
   await assert.rejects(faulty.runOnce(),/Synthetic commit failure/);
   assert.equal((await state(id)).state,'sending');const count=calls.length;
   await worker().runOnce();assert.equal(calls.length,count);assert.equal((await state(id)).state,'uncertain');
  });
  await t.test('a definite transient failure can succeed on its next scheduled attempt',async()=>{
   const id=await user('semanal');mode='temporary';await worker().runOnce();assert.equal((await state(id)).state,'retry');
   mode='ok';now=new Date(now.getTime()+900000);await worker().runOnce();assert.deepEqual(await state(id),{state:'sent',attempts:2});
   assert.equal((await pool.query('SELECT enviada FROM notificaciones WHERE usuario_id=$1',[id])).rows[0].enviada,true);
  });
  await t.test('unsubscribe and resubscribe before a tick cannot revive queued content',async()=>{
   for(const change of ['preferences','frequency','topic']) {
    const id=await user('semanal');await worker().runOnce({deliver:false});
    const prefs={recibir_notificaciones:true,frecuencia_notificaciones:'semanal',tipo_notificacion:'email'};
    if(change==='topic') {await profile(id,'topics/1','DELETE');await profile(id,'topics','POST',{tema_id:1});}
    else {await profile(id,'preferences','PUT',{...prefs,...(change==='frequency'?{frecuencia_notificaciones:'diaria'}:{recibir_notificaciones:false})});await profile(id,'preferences','PUT',prefs);}
    const before=calls.filter(c=>c.id===id).length;await worker().runOnce();
    assert.equal(calls.filter(c=>c.id===id).length,before,change);assert.equal((await state(id)).state,'cancelled');
   }
  });
  await t.test('saving unchanged preferences preserves queued delivery',async()=>{
   const id=await user('semanal');await worker().runOnce({deliver:false});
   await profile(id,'preferences','PUT',{recibir_notificaciones:true,frecuencia_notificaciones:'semanal',tipo_notificacion:'email'});
   await worker().runOnce();assert.equal((await state(id)).state,'sent');
  });
  await t.test('topic cancellation preserves other topics and cannot affect another account',async()=>{
   await pool.query("INSERT INTO temas(id,nombre,activo) VALUES(2,'Other synthetic topic',true); INSERT INTO noticias(id,titulo,contenido,tema_id) VALUES(3,'Other topic','Synthetic',2); INSERT INTO clasificacion_noticias(noticia_id,resultado,confianza,fecha_clasificacion) VALUES(3,'falsa',90,'2026-10-09 14:42:00')");
   const id=await user('semanal'),other=await user('semanal');await profile(id,'topics','POST',{tema_id:2});
   await worker().runOnce({deliver:false});await profile(id,'topics/1','DELETE');await profile(id,'topics','POST',{tema_id:1});
   await worker().runOnce();assert.deepEqual(calls.filter(c=>c.id===id).at(-1).news,[3]);assert.equal((await state(other)).state,'sent');
   const h=await history(id);assert.equal(h.items.find(i=>i.noticia_id===1).delivery_state,'cancelled');assert.equal(h.items.find(i=>i.noticia_id===3).delivery_state,'sent');
  });
  await t.test('cancellation survives a stale worker selection and cancels retries without changing sent or uncertain history',async()=>{
   const prefs={recibir_notificaciones:false,frecuencia_notificaciones:'semanal',tipo_notificacion:'email'};
   for(const initial of ['pending','retry','sent','uncertain']) {
    const id=await user('semanal');mode=initial==='retry'?'temporary':initial==='uncertain'?'timeout':'ok';
    try {await worker().runOnce({deliver:initial!=='pending'});}finally{mode='ok';}
    const stale=(await pool.query('SELECT * FROM notification_deliveries WHERE usuario_id=$1',[id])).rows[0];
    await profile(id,'preferences','PUT',prefs);
    await profile(id,'preferences','PUT',{...prefs,recibir_notificaciones:true});
    const before=calls.length;
    if(initial==='pending'||initial==='retry') {
     const client=await pool.connect();try{await worker().deliver(client,stale);}finally{client.release();}
     assert.equal((await state(id)).state,'cancelled');
    } else assert.equal((await state(id)).state,initial);
    assert.equal(calls.length,before);
   }
  });
  await t.test('synthetic backup restores delivery states, cursors, items and unique deduplication',async()=>{
   const directory=process.env.PG_BIN || 'C:/Program Files/PostgreSQL/17/bin';
   const archive=path.resolve(root,'../.healthcheck-logs',database+'.dump');
   const args=['-h',cfg.host,'-p',String(cfg.port),'-U',cfg.user];
   execFileSync(path.join(directory,'pg_dump.exe'),[...args,'-d',database,'-Fc','--no-owner','--no-acl','-f',archive],{windowsHide:true,stdio:'pipe',env:{...process.env,PGPASSWORD:cfg.password}});
   await control.query(`CREATE DATABASE ${restoredDatabase}`);restored=true;
   execFileSync(path.join(directory,'pg_restore.exe'),[...args,'-d',restoredDatabase,'--no-owner','--no-acl','--exit-on-error',archive],{windowsHide:true,stdio:'pipe',env:{...process.env,PGPASSWORD:cfg.password}});
   const restoredClient=new Client({...cfg,database:restoredDatabase});await restoredClient.connect();
   try {
    for(const table of ['notification_deliveries','notification_delivery_items','notification_delivery_cursors','notificaciones','usuarios']) {
     assert.deepEqual((await restoredClient.query(`SELECT count(*)::int AS n FROM ${table}`)).rows,(await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows);
    }
    assert.deepEqual((await restoredClient.query('SELECT id,state,attempts FROM notification_deliveries ORDER BY id')).rows,(await pool.query('SELECT id,state,attempts FROM notification_deliveries ORDER BY id')).rows);
    await assert.rejects(restoredClient.query('INSERT INTO notification_delivery_items(delivery_id,usuario_id,noticia_id) SELECT delivery_id,usuario_id,noticia_id FROM notification_delivery_items LIMIT 1'),{code:'23505'});
   } finally {await restoredClient.end();}
  });
 } finally {if(server)await new Promise(resolve=>server.close(resolve));if(sequelize)await sequelize.close();if(pool)await pool.end();if(restored)await control.query(`DROP DATABASE ${restoredDatabase} WITH (FORCE)`);if(created)await control.query(`DROP DATABASE ${database} WITH (FORCE)`);await control.end();}
});
