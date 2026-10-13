const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process');
const root=path.resolve(__dirname,'..');
const {Client}=require('../services/auth-service/node_modules/pg');
const bcrypt=require('../services/auth-service/node_modules/bcryptjs');
const jwt=require('../services/auth-service/node_modules/jsonwebtoken');
const children=[],out=[];
const instance=require('crypto').randomUUID();
let childFailure;
async function checkPort(port){await new Promise((resolve,reject)=>{const server=require('net').createServer();server.once('error',()=>reject(Error('TEST_PORT_OCCUPIED '+port)));server.listen(port,'127.0.0.1',()=>server.close(resolve));});}
const cfg={host:'127.0.0.1',port:55432,database:'phase00_contracts',user:'phase00',password:'unused'};
const env={...process.env,DB_HOST:cfg.host,DB_PORT:'55432',DB_NAME:'phase00_contracts',DB_USER:'phase00',DB_PASSWORD:'unused',PGOPTIONS:'-c default_transaction_read_only=off',JWT_SECRET:'phase00-contracts-only',GOOGLE_CLIENT_ID:'disabled',GOOGLE_CLIENT_SECRET:'disabled',NODE_ENV:'test',HEALTHCHECK_DIAGNOSTIC:'1'};
function normalize(value,key=''){if(key==='token')return '<TOKEN>';if(typeof value==='string' && /^\d{4}-\d\d-\d\dT/.test(value))return '<DATE>';if(Array.isArray(value))return value.map(v=>normalize(v));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v,k)]));return value;}
async function request(name,port,url,expected,body,token){if(childFailure)throw childFailure;const identity=await fetch(`http://127.0.0.1:${port}/api/health`);assert.equal(identity.headers.get('x-healthcheck-test-instance'),instance,'Unexpected HTTP process');const start=performance.now();const r=await fetch(`http://127.0.0.1:${port}${url}`,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});const data=await r.json();out.push({name,status:r.status,ms:Math.round(performance.now()-start),body:normalize(data)});assert.equal(r.status,expected,name);return data;}
(async()=>{await checkPort(13001);await checkPort(13003);const c=new Client(cfg);try{await c.connect();const directory=(await c.query('SHOW data_directory')).rows[0].data_directory;assert.equal(directory.replaceAll('\\','/').toLowerCase(),path.resolve(root,'../.healthcheck-logs/phase00-pg').replaceAll('\\','/').toLowerCase(),'Unexpected scratch PostgreSQL instance');const count=(await c.query('SELECT count(*) AS n FROM usuarios')).rows[0].n;assert.equal(count,'0','Scratch database must have no users');
const password='Synthetic-only-00!';const hash=await bcrypt.hash(password,10);
await c.query('BEGIN');
for(const [id,name,role,active,google] of [[-1,'normal','usuario',true,null],[-2,'admin','admin',true,null],[-3,'inactive','usuario',false,null],[-4,'oauth','usuario',true,'synthetic-google']])await c.query('INSERT INTO usuarios(id,email,nombre,contrasena,rol,activo,google_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,`${name}@example.invalid`,name,google?null:hash,role,active,google]);
await c.query("INSERT INTO modelos_ml(id,nombre,version,activo) VALUES(-1,'Synthetic metadata','phase00',true)");
await c.query("INSERT INTO noticias(id,titulo,contenido,url,fecha_publicacion) VALUES(-1,'Without relations','Synthetic','https://example.invalid/one','2026-01-01'),(-2,'Two classifications','Synthetic','https://example.invalid/two','2026-01-02')");
await c.query("INSERT INTO clasificacion_noticias(id,noticia_id,modelo_id,resultado,confianza) VALUES(-1,-2,-1,'verdadera',70.25),(-2,-2,-1,'falsa',29.75)");await c.query('COMMIT');
for(const [name,port] of [['auth',13001],['news',13003]]){const fd=fs.openSync(path.resolve(root,`../.healthcheck-logs/phase00-contract-${name}.log`),'w');children.push(spawn(process.execPath,['-r',path.join(root,'tests/support/http-instance.cjs'),'dist/app.js'],{cwd:path.join(root,`services/${name}-service`),env:{...env,PORT:String(port),HEALTHCHECK_TEST_INSTANCE:instance},stdio:['ignore',fd,fd],windowsHide:true}));fs.closeSync(fd);}
for(const child of children){child.on('error',e=>childFailure=e);child.on('exit',()=>childFailure=Error('Test child exited'));}
let ready=false;
for(let i=0;i<50;i++){if(childFailure)throw childFailure;try{const responses=await Promise.all([13001,13003].map(p=>fetch(`http://127.0.0.1:${p}/api/health`)));ready=responses.every(r=>r.headers.get('x-healthcheck-test-instance')===instance);if(ready)break;}catch{}await new Promise(r=>setTimeout(r,200));}
assert(ready,'Test servers did not become ready with matching process identity');
const normal=await request('normal-login',13001,'/api/auth/login',200,{email:'normal@example.invalid',contrasena:password});
const admin=await request('admin-login',13001,'/api/auth/login',200,{email:'admin@example.invalid',contrasena:password});
await request('inactive-login',13001,'/api/auth/login',401,{email:'inactive@example.invalid',contrasena:password});
await request('oauth-password-login',13001,'/api/auth/login',401,{email:'oauth@example.invalid',contrasena:password});
await request('normal-profile',13001,'/api/auth/profile',200,null,normal.data.token);
const oauthToken=jwt.sign({id:-4,email:'oauth@example.invalid',rol:'usuario'},env.JWT_SECRET,{expiresIn:'5m'});
await request('oauth-profile-synthetic-token',13001,'/api/auth/profile',200,null,oauthToken);
await request('user-forbidden-stats',13003,'/api/stats/general',403,null,normal.data.token);
await request('admin-stats',13003,'/api/stats/general',200,null,admin.data.token);
await request('news-without-relations-known-schema-failure',13003,'/api/news/-1',500);
await request('news-multiple-classifications-known-schema-failure',13003,'/api/news/-2',500);
const registered=await request('register',13001,'/api/auth/register',201,{email:'registered@example.invalid',nombre:'Synthetic registered',contrasena:password});
const saved=(await c.query('SELECT contrasena FROM usuarios WHERE id=$1',[registered.data.user.id])).rows[0];assert.notEqual(saved.contrasena,password);assert(await bcrypt.compare(password,saved.contrasena));
fs.writeFileSync(path.join(root,'tests/fixtures/contracts-observed.json'),JSON.stringify({source:'HTTP against isolated restored scratch DB 55432; synthetic only; news 500 is a known failure, not success',cases:out},null,2)+'\n');console.log(`Captured ${out.length} cases; auth bcrypt verified; news schema failures reproduced.`);
}finally{for(const child of children)child.kill();await c.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
