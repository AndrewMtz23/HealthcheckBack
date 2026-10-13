// Read-only verification. Never prints tokens, credentials or user records.
const {loadLocalConfig}=require('./diagnostic-config.cjs');
const {Client}=require('../services/auth-service/node_modules/pg');
const jwt=require('../services/auth-service/node_modules/jsonwebtoken');
const assert=require('node:assert/strict');
(async()=>{const cfg=loadLocalConfig();const db=new Client({host:cfg.DB_HOST,port:Number(cfg.DB_PORT),database:cfg.DB_NAME,user:cfg.DB_USER,password:cfg.DB_PASSWORD,options:'-c default_transaction_read_only=on'});try{await db.connect();const admin=(await db.query("SELECT id FROM usuarios WHERE activo=true AND rol='admin' ORDER BY id LIMIT 1")).rows[0];assert(admin,'No active administrator');const token=jwt.sign({id:admin.id,rol:'admin'},'phase00-synthetic-local-only',{expiresIn:'1m'});
 for(const [port,url] of [[4000,'/api/auth/admin/users?limit=1'],...[ 'summary','news','sources','topics','reports','activity','models','notifications','preferences'].map(s=>[3003,`/api/admin/${s}`])]){const r=await fetch(`http://127.0.0.1:${port}${url}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});assert.equal(r.status,200,`${url}: ${r.status}`);const body=await r.json();assert(body.data);console.log(`PASS GET ${url}: 200`);}
 for(const section of ['dashboard','users','news','sources','topics','reports','activity','models','notifications','preferences']){const r=await fetch(`http://127.0.0.1:3000/admin/${section}`,{signal:AbortSignal.timeout(60000)});assert.equal(r.status,200,section);console.log(`PASS page /admin/${section}: 200 (HTTP only)`);}
}finally{await db.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
