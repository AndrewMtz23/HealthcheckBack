// Writes only a unique synthetic database in the verified scratch cluster.
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..'), database='recovery_'+randomUUID().replaceAll('-','');
Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'55432',DB_USER:'phase00',DB_PASSWORD:'unused',DB_NAME:database,NODE_ENV:'test',JWT_SECRET:'synthetic-recovery-integration-secret',GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',RECOVERY_MAIL_ENABLED:'false'});
const {Client}=require('../services/auth-service/node_modules/pg');
const express=require('../services/auth-service/node_modules/express');
const {createRecoveryRouter}=require('../services/auth-service/dist/account/routes');
const {RecoveryTokens}=require('../services/auth-service/dist/account/security');
const sequelize=require('../services/auth-service/dist/config/db').default;
const User=require('../services/auth-service/dist/models/User').default;
const passport=require('../services/auth-service/dist/config/passport').default;
const {authenticate}=require('../services/auth-service/dist/middleware/auth');
const auth=require('../services/auth-service/dist/controllers/authController');

test('recovery and password change through HTTP with isolated PostgreSQL and simulated mail',async t=>{
 const control=new Client({host:'127.0.0.1',port:55432,user:'phase00',password:'unused',database:'postgres'});
 let server,created=false,db,now=Date.now();const mailbox=[];let failMail=false;
 const tokens=new RecoveryTokens(()=>now),password='Synthetic-original-123!',replacement='Synthetic-replacement-456!';
 try {
  await control.connect();
  assert.equal(path.resolve((await control.query('SHOW data_directory')).rows[0].data_directory).toLowerCase(),path.resolve(root,'../.healthcheck-logs/phase00-pg').toLowerCase());
  await control.query(`CREATE DATABASE ${database}`);created=true;
  db=new Client({host:'127.0.0.1',port:55432,user:'phase00',password:'unused',database});await db.connect();
  await db.query(fs.readFileSync(path.join(root,'db.sql'),'utf8'));
  const app=express();app.use(express.json());app.use(passport.initialize());
  const mail={available:true,async send(email,token){mailbox.push({email,token});if(failMail)throw Error('synthetic transport failure');}};
  app.use('/password',createRecoveryRouter(mail,tokens));
  app.use('/disabled',createRecoveryRouter({available:false,send:async()=>{throw Error('must not send');}}));
  app.post('/login',auth.login);app.get('/profile',authenticate,auth.getProfile);
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const call=async(route,body,token)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}${route}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};};
  const create=(email,extra={})=>User.create({email,nombre:'Synthetic',contrasena:password,activo:true,rol:'usuario',...extra});
  const user=await create('member@example.invalid'),other=await create('other@example.invalid');
  await create('inactive@example.invalid',{activo:false});await create('google@example.invalid',{contrasena:undefined,google_id:'synthetic-google'});
  const login=async(email,p=password)=>{const r=await call('/login',{email,contrasena:p});assert.equal(r.status,200);return r.body.data.token;};
  const waitMail=async count=>{for(let i=0;i<100&&mailbox.length<count;i++)await new Promise(r=>setTimeout(r,10));assert.equal(mailbox.length,count);};
  await t.test('disabled transport returns temporary failure for every address',async()=>{
   assert.equal((await call('/disabled/forgot',{email:user.email})).status,503);
   assert.equal((await call('/disabled/forgot',{email:'absent@example.invalid'})).status,503);
  });
  let first;
  await t.test('identical response for local, nonexistent, inactive and Google-only accounts',async()=>{
   first=await call('/password/forgot',{email:user.email});assert.equal(first.status,202);
   for(const email of ['absent@example.invalid','inactive@example.invalid','google@example.invalid'])assert.deepEqual(await call('/password/forgot',{email}),first);
   await waitMail(1);assert.equal(mailbox[0].email,user.email);
  });
  await t.test('concurrent redemption succeeds once, revokes both devices and preserves other users',async()=>{
   const a=await login(user.email),b=await login(user.email),c=await login(other.email);
   const results=await Promise.all([call('/password/reset',{token:mailbox[0].token,contrasena:replacement}),call('/password/reset',{token:mailbox[0].token,contrasena:replacement})]);
   assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
   assert.equal((await call('/profile',null,a)).status,401);assert.equal((await call('/profile',null,b)).status,401);
   assert.equal((await call('/profile',null,c)).status,200);await login(user.email,replacement);
   assert.equal((await call('/login',{email:user.email,contrasena:password})).status,401);
  });
  await t.test('authenticated change requires current password, validates length and revokes every device',async()=>{
   const a=await login(other.email),b=await login(other.email);
   assert.equal((await call('/password/change',{actual:password,contrasena:replacement})).status,401);
   assert.equal((await call('/password/change',{actual:'wrong',contrasena:replacement},a)).status,400);
   assert.equal((await call('/password/change',{actual:password,contrasena:'é'.repeat(37)},a)).status,400);
   assert.equal((await call('/password/change',{actual:password,contrasena:replacement},a)).status,200);
   assert.equal((await call('/profile',null,b)).status,401);await login(other.email,replacement);
  });
  await t.test('expired, replaced and deactivated-account tokens are denied',async()=>{
   await call('/password/forgot',{email:other.email});await waitMail(2);now+=900001;
   assert.equal((await call('/password/reset',{token:mailbox[1].token,contrasena:password})).status,400);
   await call('/password/forgot',{email:other.email});await waitMail(3);
   await call('/password/forgot',{email:other.email});await waitMail(4);
   assert.equal((await call('/password/reset',{token:mailbox[2].token,contrasena:password})).status,400);
   await other.update({activo:false});
   assert.equal((await call('/password/reset',{token:mailbox[3].token,contrasena:password})).status,400);
  });
  await t.test('failed mail cannot leave a redeemable link and does not enumerate',async()=>{
   failMail=true;assert.deepEqual(await call('/password/forgot',{email:user.email}),first);await waitMail(5);
   await new Promise(r=>setTimeout(r,25));assert.equal((await call('/password/reset',{token:mailbox[4].token,contrasena:password})).status,400);
  });
  await t.test('changed credentials invalidate outstanding links without changing another account',async()=>{
   failMail=false;await call('/password/forgot',{email:user.email});await waitMail(6);
   await user.update({contrasena:'Synthetic-admin-change!'});
   assert.equal((await call('/password/reset',{token:mailbox[5].token,contrasena:password})).status,400);
   assert.equal(await (await User.findByPk(other.id)).isValidPassword(replacement),true);
  });
  await t.test('per-email suppression is indistinguishable and direct Auth request limit cannot be bypassed',async()=>{
   assert.deepEqual(await call('/password/forgot',{email:other.email}),first);
   await new Promise(r=>setTimeout(r,25));assert.equal(mailbox.length,6);
   let r;for(let i=0;i<45;i++) {r=await call('/password/reset',{token:'invalid',contrasena:password});if(r.status===429)break;}
   assert.equal(r.status,429);
  });
 } finally {
  if(server)await new Promise(r=>server.close(r));await sequelize.close();if(db)await db.end();
  if(created)await control.query(`DROP DATABASE ${database} WITH (FORCE)`);await control.end();
 }
});
