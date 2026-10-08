// Only a newly-created database in the validated scratch cluster may be written.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {randomUUID} = require('node:crypto');
const {Client} = require('../services/auth-service/node_modules/pg');
const jwt = require('../services/auth-service/node_modules/jsonwebtoken');
const bcrypt = require('../services/auth-service/node_modules/bcryptjs');
const root = path.resolve(__dirname, '..'), instance = randomUUID();
const database = 'sessions_' + randomUUID().replaceAll('-', '');
const cfg = {host:'127.0.0.1', port:55432, user:'phase00', password:'unused'};
const secret = 'synthetic-session-integration-secret';
const password = 'Synthetic-session-123!';
const ports = {auth:13101, news:13103, gateway:13400, ml:13500};
const children = [];
let db, control, checks = 0, failures = [];
async function call(service, route, token, method='GET', body, scheme='Bearer') {
  const response = await fetch(`http://127.0.0.1:${ports[service]}${route}`, {
    method, headers:{'Content-Type':'application/json', ...(token ? {Authorization:`${scheme} ${token}`} : {})},
    body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(10000)
  });
  assert.equal(response.headers.get('x-healthcheck-test-instance'), instance);
  return {status:response.status, body:await response.json()};
}
async function expect(service, route, token, status, method, body) {
  const response = await call(service, route, token, method, body);
  assert.equal(response.status, status, `${service} ${route}: expected ${status}, got ${response.status}`);
  checks++; return response.body;
}
async function login(id) {
  return (await expect('auth','/api/auth/login',null,200,'POST',{email:`u${id}@example.invalid`,contrasena:password})).data.token;
}
async function scenario(name, fn) {
  try {await fn(); console.log('PASS:',name);} catch(e) {failures.push(name);console.error('FAIL:',name,e.message);}
}
async function start(name) {
  const cwd = path.join(root,name==='gateway'?'api-gateway':`services/${name}-service`);
  const log = fs.openSync(path.resolve(root,`../.healthcheck-logs/session-${name}.log`),'w');
  const executable=name==='ml'?path.join(root,'services/ml-service/.venv/Scripts/python.exe'):process.execPath;
  const args=name==='ml'?[path.join(root,'tests/support/ml-session-app.py')]:['-r',path.join(root,'tests/support/http-instance.cjs'),'dist/app.js'];
  const child = spawn(executable,args,{
    cwd, windowsHide:true, stdio:['ignore',log,log], env:{...process.env,
      DB_HOST:cfg.host,DB_PORT:String(cfg.port),DB_USER:cfg.user,DB_PASSWORD:cfg.password,DB_NAME:database,
      PORT:String(ports[name]),JWT_SECRET:secret,JWT_EXPIRATION:'3600',NODE_ENV:'test',HEALTHCHECK_DIAGNOSTIC:'1',
      HEALTHCHECK_TEST_INSTANCE:instance,GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',
      AUTH_SERVICE_URL:`http://127.0.0.1:${ports.auth}`,ML_SERVICE_URL:'http://127.0.0.1:13500',
      ML_GATEWAY_SECRET:'synthetic-internal-session-secret-123',RATE_LIMIT_MAX_REQUESTS:'1000',
      PGOPTIONS:'-c default_transaction_read_only=off -c statement_timeout=10000'
    }});
  fs.closeSync(log); children.push(child);
  for(let i=0;i<900;i++) {
    if (child.exitCode !== null || child.signalCode !== null) throw Error(`Scratch ${name} exited during startup`);
    try {const r=await call(name,name==='gateway'?'/health':'/api/health');if(r.status===200)return child;}catch{}
    await new Promise(r=>setTimeout(r,100));
  }
  throw Error(`Scratch ${name} failed to start`);
}
async function stop(child) {if(child.exitCode!==null || child.signalCode!==null)return;await new Promise(resolve=>{child.once('exit',resolve);child.kill();});}
(async()=>{try {
  for(const port of Object.values(ports))await new Promise((resolve,reject)=>{const s=require('node:net').createServer();s.once('error',reject);s.listen(port,'127.0.0.1',()=>s.close(resolve));});
  control=new Client({...cfg,database:'postgres'});await control.connect();
  assert.equal(path.resolve((await control.query('SHOW data_directory')).rows[0].data_directory).toLowerCase(),path.resolve(root,'../.healthcheck-logs/phase00-pg').toLowerCase());
  await control.query(`CREATE DATABASE ${database}`);db=new Client({...cfg,database});await db.connect();
  await db.query(fs.readFileSync(path.join(root,'db.sql'),'utf8'));
  await db.query('ALTER TABLE noticias ADD COLUMN fecha_analisis TIMESTAMP');
  await db.query("ALTER TYPE resultado_enum ADD VALUE 'dudosa'");
  const hash=await bcrypt.hash(password,10);
  for(let id=1;id<=5;id++)await db.query('INSERT INTO usuarios(id,nombre,email,contrasena,rol,activo) VALUES($1,$2,$3,$4,$5,true)',[id,`Synthetic ${id}`,`u${id}@example.invalid`,hash,id<3?'admin':'usuario']);
  await db.query("INSERT INTO fuentes(id,nombre) VALUES(1,'Synthetic source'); INSERT INTO noticias(id,titulo,contenido,fuente_id) VALUES(1,'Synthetic','Synthetic text',1); INSERT INTO historial_consultas(id,usuario_id,noticia_id) VALUES(1,3,1),(2,4,1)");
  let auth=await start('auth');await start('news');await start('ml');await start('gateway');
  await scenario('gateway reaches real ML model list only with a current administrator',async()=>{
    const admin=await login(1),member=await login(3);
    await expect('ml','/api/ml/train/models',admin,403);
    await expect('gateway','/api/ml/train/models',member,403);
    const result=await expect('gateway','/api/ml/train/models',admin,200);
    assert.deepEqual(result.models,[]);
  });
  await scenario('two devices remain active; logout revokes only the presented session across services',async()=>{
    const a=await login(3),b=await login(3);
    assert.notEqual(a,b,'Independent logins must issue distinct sessions');
    await expect('auth','/api/auth/profile',a,200);await expect('news','/api/history',b,200);
    await expect('gateway','/api/auth/logout',a,200,'POST');
    for(const [s,p] of [['auth','/api/auth/profile'],['news','/api/history'],['gateway','/api/auth/profile'],['gateway','/api/ml/train/models']])await expect(s,p,a,401);
    await expect('auth','/api/auth/profile',b,200);
  });
  await scenario('existing admin token loses privileges and existing member token gains current role',async()=>{
    const admin=await login(1),target=await login(2);
    await expect('auth','/api/auth/admin/users/2',admin,200,'PATCH',{rol:'usuario'});
    for(const [s,p] of [['auth','/api/auth/admin/users'],['news','/api/stats/general'],['news','/api/admin/summary'],['gateway','/api/ml/train/models']])await expect(s,p,target,403);
    await expect('news','/api/temas',target,403,'POST',{nombre:'Should not exist'});
    await expect('auth','/api/auth/admin/users/2',admin,200,'PATCH',{rol:'admin'});
    await expect('news','/api/stats/general',target,200);
    await expect('gateway','/api/ml/train/models',target,200);
  });
  await scenario('deactivation revokes every device and reactivation never resurrects sessions',async()=>{
    const admin=await login(1),a=await login(4),b=await login(4);
    await expect('auth','/api/auth/admin/users/4',admin,200,'PATCH',{activo:false});
    for(const [s,p] of [['auth','/api/auth/profile'],['news','/api/history'],['gateway','/api/ml/classify/predict']])await expect(s,p,a,401,s==='gateway'?'POST':'GET',s==='gateway'?{text:'Synthetic text'}:undefined);
    await expect('auth','/api/auth/admin/users/4',admin,200,'PATCH',{activo:true});
    await expect('auth','/api/auth/profile',a,401);await expect('news','/api/history',b,401);
    await expect('auth','/api/auth/profile',await login(4),200);
  });
  await scenario('password replacement invalidates all prior sessions',async()=>{
    const admin=await login(1),a=await login(5),b=await login(5);
    await expect('auth','/api/auth/admin/users/5',admin,200,'PATCH',{contrasena:'Different-synthetic-123!'});
    await expect('auth','/api/auth/profile',a,401);await expect('news','/api/history',b,401);
  });
  await scenario('a login waiting behind deactivation cannot issue a stale session',async()=>{
    const admin=await login(1);
    const observer=new Client({...cfg,database});await observer.connect();
    const waitForLocks=async count=>{
      for(let i=0;i<150;i++) {
        const result=await observer.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock'",[database]);
        if(result.rows[0].n>=count)return;
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      throw Error('Expected synthetic account lock was not reached');
    };
    let deactivation,signIn;
    try {
      await db.query('BEGIN');await db.query('SELECT id FROM usuarios WHERE id=4 FOR UPDATE');
      deactivation=call('auth','/api/auth/admin/users/4',admin,'PATCH',{activo:false});
      await waitForLocks(1);
      signIn=call('auth','/api/auth/login',null,'POST',{email:'u4@example.invalid',contrasena:password});
      await waitForLocks(2);
    } finally {await db.query('COMMIT');await observer.end();}
    assert.equal((await deactivation).status,200);
    const result=await signIn;
    await expect('auth','/api/auth/admin/users/4',admin,200,'PATCH',{activo:true});
    assert.equal(result.status,401,'A login overtaken by deactivation must recheck account state under lock');
    checks++;
  });
  await scenario('logout accepts the same Bearer casing as authentication',async()=>{
    const token=await login(3);
    assert.equal((await call('auth','/api/auth/logout',token,'POST',undefined,'bearer')).status,200);
    await expect('auth','/api/auth/profile',token,401);
  });
  await scenario('invalid, expired and unregistered signed tokens fail at all boundaries',async()=>{
    const active=jwt.decode(await login(1));
    const expired=jwt.sign({...active,exp:Math.floor(Date.now()/1000)-1},secret);
    const wrongAlgorithm=jwt.sign(active,secret,{algorithm:'HS384'});
    for(const token of [null,'invalid',expired,wrongAlgorithm,jwt.sign({id:1,rol:'admin'},secret,{expiresIn:300})])
      for(const [s,p] of [['auth','/api/auth/profile'],['news','/api/history'],['gateway','/api/auth/profile']])await expect(s,p,token,401);
  });
  await scenario('ownership is server scoped even with forged body/query identity',async()=>{
    const token=await login(3);
    const result=await expect('news','/api/history?usuario_id=4',token,200);
    assert.equal(result.data.total,1);assert.equal(result.data.history[0].id,1);
    await expect('news','/api/history/2',token,404,'DELETE');
    await expect('news','/api/interactions',token,201,'POST',{noticia_id:1,tipo_interaccion:'compartir',usuario_id:4});
    assert.equal((await db.query('SELECT usuario_id FROM interacciones_noticia')).rows[0].usuario_id,3);
    await expect('news','/api/history',token,200,'DELETE');
    assert.equal((await db.query('SELECT usuario_id FROM historial_consultas')).rows[0].usuario_id,4);
  });
  await scenario('Auth outage fails closed; restarting never restores revoked or old sessions',async()=>{
    const token=await login(3);await stop(auth);
    await expect('news','/api/history',token,503);await expect('gateway','/api/auth/profile',token,503);
    auth=await start('auth');await expect('auth','/api/auth/profile',token,401);
    await expect('news','/api/history',await login(3),200);
  });
  console.log(`${checks} HTTP assertions; ${failures.length} failed scenarios.`);
  assert.equal(failures.length,0,failures.join('; '));
}finally {
  for(const child of children)await stop(child);
  if(db)await db.end();
  if(control){await control.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);await control.end();}
}})().catch(e=>{console.error(e.message);process.exitCode=1;});
