const {test}=require('node:test'),assert=require('node:assert/strict');
const {GoogleStateStore}=require('../services/auth-service/dist/account/googleState');
process.env.GOOGLE_CLIENT_ID='synthetic-client';process.env.GOOGLE_CLIENT_SECRET='synthetic-secret';
const passport=require('../services/auth-service/dist/config/passport').default;
const User=require('../services/auth-service/dist/models/User').default;
const strategy=passport._strategy('google');
const verify=profile=>new Promise((resolve,reject)=>strategy._verify('unused','unused',profile,(err,user)=>err?reject(err):resolve(user)));
test('matching email cannot silently link a different Google identity',async t=>{
 let saves=0;const local={id:4,email:'local@example.invalid',activo:true,save:async()=>{saves++;}};
 t.mock.method(User,'findOne',async({where})=>where.google_id?null:local);
 const result=await verify({id:'google-attacker',emails:[{value:local.email,verified:true}],displayName:'Synthetic'});
 assert.equal(result,false);assert.equal(saves,0);assert.equal(local.google_id,undefined);
});
test('Google signup requires verified email; existing stable identity preserves its role',async t=>{
 let created=0;t.mock.method(User,'findOne',async()=>null);
 t.mock.method(User,'create',async()=>{created++;throw Error('unverified profile must not create user');});
 assert.equal(await verify({id:'unverified',emails:[{value:'new@example.invalid',verified:false}]}),false);assert.equal(created,0);
 const known={id:5,rol:'admin',activo:true,save:async()=>{}};
 t.mock.method(User,'findOne',async()=>known);
 assert.equal(await verify({id:'known',emails:[]}),known);assert.equal(known.rol,'admin');
 known.activo=false;assert.equal(await verify({id:'known',emails:[]}),false);
});
test('OAuth state is tied to its browser cookie, expiring and consumed once',()=>{
 let now=0,cookie;const store=new GoogleStateStore(false,()=>now);
 const req={res:{cookie:(name,value,options)=>{cookie=`${name}=${value}`;assert(options.httpOnly);assert.equal(options.sameSite,'lax');},clearCookie:()=>{}},headers:{}};
 let state;store.store(req,(err,value)=>{assert.ifError(err);state=value;});
 let result;store.verify({...req,headers:{cookie:'hc_google_state=wrong'}},state,(err,ok)=>{assert.ifError(err);result=ok;});assert.equal(result,false);
 store.verify({...req,headers:{cookie}},state,(err,ok)=>{assert.ifError(err);result=ok;});assert.equal(result,true);
 store.verify({...req,headers:{cookie}},state,(err,ok)=>{result=ok;});assert.equal(result,false);
 store.store(req,(err,value)=>{state=value;});now=600001;
 store.verify({...req,headers:{cookie}},state,(err,ok)=>{result=ok;});assert.equal(result,false);
});
