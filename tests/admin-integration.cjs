// Explicit integration runner: isolated PostgreSQL cluster only, never the application DB.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {Client}=require('../services/auth-service/node_modules/pg');
const jwt=require('../services/auth-service/node_modules/jsonwebtoken');
const bcrypt=require('../services/auth-service/node_modules/bcryptjs');
const root=path.resolve(__dirname,'..'),instance=require('node:crypto').randomUUID();
const database='admin_test_'+Date.now();const cfg={host:'127.0.0.1',port:55432,user:'phase00',password:'unused'};
const children=[];let checks=0;let db;let control;
const secret='isolated-admin-test-only';
const sessions=new Map(); const token=id=>sessions.get(id)||jwt.sign({id,rol:'admin'},secret,{expiresIn:'5m'});
async function request(service,route,status=200,body,method='GET',id=1){const port=service==='auth'?13001:13003;const response=await fetch(`http://127.0.0.1:${port}/api/${service==='auth'?'auth/':''}admin/${route}`,{method,headers:{'Content-Type':'application/json',...(id?{Authorization:`Bearer ${token(id)}`}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});assert.equal(response.headers.get('x-healthcheck-test-instance'),instance);const result=await response.json();assert.equal(response.status,status,`${service}/${route}: ${JSON.stringify(result)}`);checks++;return result.data;}
async function free(port){await new Promise((resolve,reject)=>{const server=require('node:net').createServer();server.once('error',reject);server.listen(port,'127.0.0.1',()=>server.close(resolve));});}
(async()=>{try{
 await free(13001);await free(13003);control=new Client({...cfg,database:'postgres'});await control.connect();
 const directory=(await control.query('SHOW data_directory')).rows[0].data_directory;
 assert.equal(path.resolve(directory).toLowerCase(),path.resolve(root,'../.healthcheck-logs/phase00-pg').toLowerCase());
 await control.query(`CREATE DATABASE ${database}`);db=new Client({...cfg,database});await db.connect();await db.query(fs.readFileSync(path.join(root,'db.sql'),'utf8'));await db.query('ALTER TABLE noticias ADD COLUMN fecha_analisis TIMESTAMP');await db.query("ALTER TYPE resultado_enum ADD VALUE 'dudosa'");
 await db.query("INSERT INTO usuarios(id,nombre,email,rol,activo) VALUES (1,'Admin One','one@example.invalid','admin',true),(2,'Admin Two','two@example.invalid','admin',true),(3,'Normal','normal@example.invalid','usuario',true),(4,'Inactive','inactive@example.invalid','admin',false)");await db.query("SELECT setval('usuarios_id_seq',10)");
 await db.query("INSERT INTO fuentes(id,nombre,confiabilidad) VALUES(1,'Test source',0.8)");await db.query("SELECT setval('fuentes_id_seq',10)");
 await db.query("INSERT INTO noticias(id,titulo,contenido,fecha_publicacion,fuente_id) VALUES(1,'Unclassified','Test',NULL,1),(2,'Twice classified','Test','2026-10-05',1)");
 await db.query("INSERT INTO clasificacion_noticias(noticia_id,resultado,fecha_clasificacion) VALUES(2,'verdadera','2026-10-01'),(2,'falsa','2026-10-02')");await db.query("INSERT INTO reportes_fuente(id,fuente_id,usuario_id,motivo) VALUES(1,1,3,'Synthetic report')");
 for(const [name,port] of [['auth',13001],['news',13003]]){const log=fs.openSync(path.resolve(root,`../.healthcheck-logs/admin-test-${name}.log`),'w');const child=spawn(process.execPath,['-r',path.join(root,'tests/support/http-instance.cjs'),'dist/app.js'],{cwd:path.join(root,`services/${name}-service`),env:{...process.env,DB_HOST:cfg.host,DB_PORT:String(cfg.port),DB_NAME:database,DB_USER:cfg.user,DB_PASSWORD:cfg.password,JWT_SECRET:secret,AUTH_SERVICE_URL:'http://127.0.0.1:13001',GOOGLE_CLIENT_ID:'disabled',GOOGLE_CLIENT_SECRET:'disabled',NODE_ENV:'test',HEALTHCHECK_DIAGNOSTIC:'1',HEALTHCHECK_TEST_INSTANCE:instance,PGOPTIONS:'-c default_transaction_read_only=off -c statement_timeout=10000',PORT:String(port)},stdio:['ignore',log,log],windowsHide:true});children.push(child);fs.closeSync(log);}
 let ready=false;for(let i=0;i<300;i++){try{const rs=await Promise.all([13001,13003].map(p=>fetch(`http://127.0.0.1:${p}/api/health`)));if(rs.every(r=>r.headers.get('x-healthcheck-test-instance')===instance)){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,150));}assert(ready,'Test services unavailable');
 const initialPassword='Synthetic-admin-integration-123!';
 await db.query('UPDATE usuarios SET contrasena=$1',[await bcrypt.hash(initialPassword,10)]);
 for(const id of [1,2,3]) {
  const email=(await db.query('SELECT email FROM usuarios WHERE id=$1',[id])).rows[0].email;
  const response=await fetch('http://127.0.0.1:13001/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,contrasena:initialPassword})});
  assert.equal(response.status,200); sessions.set(id,(await response.json()).data.token);
 }
 await request('auth','users',401,undefined,'GET',null);await request('news','summary',401,undefined,'GET',null);await request('auth','users',403,undefined,'GET',3);await request('news','summary',403,undefined,'GET',3);await request('news','summary',401,undefined,'GET',4);
 const users=await request('auth','users');assert.equal(users.total,4);assert(!JSON.stringify(users).includes('contrasena'));assert(!JSON.stringify(users).includes('google_id'));
 await request('auth','users/1',409,{activo:false},'PATCH');await request('auth','users/1',409,{rol:'usuario'},'PATCH');
 const password='ScratchPassword123!';const created=await request('auth','users',201,{nombre:'Created',email:'created@example.invalid',rol:'usuario',contrasena:password,imagen_url:'https://example.invalid/first.png'},'POST');assert(!('contrasena'in created));assert.equal(created.imagen_url,'https://example.invalid/first.png');
 const changedImage=await request('auth',`users/${created.id}`,200,{imagen_url:'https://example.invalid/second.png'},'PATCH');assert.equal(changedImage.imagen_url,'https://example.invalid/second.png');
 const imageList=await request('auth','users?q=created@example.invalid');assert.equal(imageList.items[0].imagen_url,changedImage.imagen_url);
 await request('auth',`users/${created.id}`,400,{imagen_url:'javascript:alert(1)'},'PATCH');
 assert.equal((await request('auth',`users/${created.id}`,200,{imagen_url:''},'PATCH')).imagen_url,null);
 assert.equal((await db.query('SELECT imagen_url FROM usuarios WHERE id=$1',[created.id])).rows[0].imagen_url,null);
 const hash=(await db.query('SELECT contrasena FROM usuarios WHERE id=$1',[created.id])).rows[0].contrasena;assert(await bcrypt.compare(password,hash));
 await request('auth','users',409,{nombre:'Duplicate',email:'created@example.invalid',contrasena:password},'POST');await request('auth',`users/${created.id}`,200,{nombre:'Edited',activo:false},'PATCH');await request('auth','users?startDate=2026-02-30',400);await request('auth','users?rol=usuario&activo=false',200);
 await db.query("INSERT INTO usuarios(id,nombre,email,fecha_registro) VALUES(1001,'Boundary start','b1@example.invalid','2026-10-05 00:00:00'),(1002,'Boundary end','b2@example.invalid','2026-10-05 23:59:59'),(1003,'Boundary before','b3@example.invalid','2026-10-04 23:59:59'),(1004,'Boundary after','b4@example.invalid','2026-10-06 00:00:00')");
 const boundary=await request('auth','users?q=Boundary&startDate=2026-10-05&endDate=2026-10-05');assert.deepEqual(boundary.items.map(u=>u.id).sort(),[1001,1002],'Calendar date filter must preserve stored wall time');
 await request('auth','users?startDate=2026-10-05&endDate=2026-10-01',400);
 const summary=await request('news','summary?startDate=2026-10-01&endDate=2026-10-05');assert.equal(summary.totals.news,2);assert.equal(summary.totals.unclassified,1);assert.equal(summary.distribution.reduce((s,r)=>s+r.total,0),2);assert.equal(summary.distribution.find(r=>r.resultado==='falsa').total,1);
 for(const section of ['news','sources','topics','reports','activity','models','notifications','preferences'])await request('news',section);
 const news=await request('news','news');assert.equal(news.total,2);assert(news.items.some(n=>n.fecha_publicacion===null));assert.equal((await request('news','news/2')).classifications.length,2);assert.equal((await request('news','news?resultado=sin_clasificar')).total,1);
 await request('news','news?startDate=2026-02-30',400);await request('news','news?limit=1000',400);await request('news','news?sort=id%3BDROP%20TABLE%20usuarios');
 const topic=await request('news','topics',201,{nombre:'Scratch topic',activo:false},'POST');await request('news',`topics/${topic.id}`,200,{activo:true},'PATCH');assert.equal((await request('news','topics?activo=true')).total,1);
 const source=await request('news','sources',201,{nombre:'Created source',url:'https://example.invalid/source',confiabilidad:0,verificada:false},'POST');assert.equal(Number(source.confiabilidad),0);await request('news',`sources/${source.id}`,200,{verificada:true},'PATCH');await request('news','sources',400,{nombre:'Unsafe',url:'javascript:alert(1)'},'POST');
 await Promise.all([request('news','reports/1',200,{estado:'revisado'},'PATCH'),request('news','reports/1',200,{estado:'revisado'},'PATCH')]);assert.equal(Number((await db.query('SELECT confiabilidad FROM fuentes WHERE id=1')).rows[0].confiabilidad),0.7);await request('news','reports/1',409,{estado:'desestimado'},'PATCH');
 await db.query("UPDATE usuarios SET rol='usuario' WHERE id=2");await request('news','summary',403,undefined,'GET',2);await request('auth','users',403,undefined,'GET',2);
 await db.query("UPDATE usuarios SET rol='admin' WHERE id=2");const responses=await Promise.all([fetch('http://127.0.0.1:13001/api/auth/admin/users/2',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token(1)}`},body:JSON.stringify({rol:'usuario'})}),fetch('http://127.0.0.1:13001/api/auth/admin/users/1',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token(2)}`},body:JSON.stringify({rol:'usuario'})})]);assert.equal(responses.filter(r=>r.status===200).length,1);assert.equal((await db.query("SELECT count(*)::int AS n FROM usuarios WHERE activo=true AND rol='admin'")).rows[0].n,1);checks++;
 assert.equal((await db.query('SELECT count(*)::int AS n FROM preferencias_usuario')).rows[0].n,0);assert.equal((await db.query('SELECT count(*)::int AS n FROM noticias')).rows[0].n,2);
 await require('./support/profile-cases.cjs')({db,secret,instance,sessions});
 await require('./support/member-cases.cjs')({db,secret,instance,sessions});
 console.log(`PASS: ${checks} HTTP checks; password hashing, stale role denial, latest classification, report idempotency and concurrent admin protection. Scratch DB: ${database}`);
 }finally{for(const child of children)child.kill();if(db)await db.end();if(control)await control.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
