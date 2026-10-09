const {test}=require('node:test'),assert=require('node:assert/strict');
Object.assign(process.env,{GOOGLE_CLIENT_ID:'synthetic-client',GOOGLE_CLIENT_SECRET:'synthetic-secret',GOOGLE_CALLBACK_URL:'http://localhost:3001/api/auth/google/callback',FRONTEND_URL:'http://localhost:3000',JWT_SECRET:'synthetic-google-http-test-secret',RECOVERY_MAIL_ENABLED:'false',NODE_ENV:'test'});
const express=require('../services/auth-service/node_modules/express');
const passport=require('../services/auth-service/dist/config/passport').default;
const User=require('../services/auth-service/dist/models/User').default;
test('gateway preserves OAuth cookie/state, rejects replay and exposes recovery with server authorization',async t=>{
 const servers=[];const listen=app=>new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>{servers.push(s);resolve(`http://127.0.0.1:${s.address().port}`);});});
 let exchanged=0;
 const google=passport._strategy('google');
 t.mock.method(google._oauth2,'getOAuthAccessToken',(_code,_params,done)=>{exchanged++;done(null,'synthetic-access','synthetic-refresh',{});});
 t.mock.method(google,'userProfile',(_token,done)=>done(null,{id:'known-google',emails:[]}));
 t.mock.method(User,'findOne',async()=>({id:9001,activo:true,rol:'usuario',google_id:'known-google',save:async()=>{}}));
 const app=express();app.use(express.json());app.use(passport.initialize());app.use('/api/auth',require('../services/auth-service/dist/routes/authRoutes').default);
 try {
  const auth=await listen(app);process.env.AUTH_SERVICE_URL=auth;
  const gateway=express();
  // Synthetic clients behind the loopback-only test reverse proxy.
  gateway.set('trust proxy','loopback');
  gateway.use(express.json());gateway.use('/api/auth',require('../api-gateway/dist/routes/auth.routes').default);
  const base=await listen(gateway);
  const call=(path,options={})=>fetch(base+'/api/auth'+path,{redirect:'manual',...options});
  const begin=await call('/google');assert.equal(begin.status,302);
  assert.equal(begin.headers.get('cache-control'),'no-store');
  const cookie=begin.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Lax/);
  const state=new URL(begin.headers.get('location')).searchParams.get('state');assert.match(state,/^[a-f0-9]{64}$/);
  const stolen=await call(`/google/callback?code=synthetic&state=${state}`);assert.match(stolen.headers.get('location'),/autenticacion-fallida/);assert.equal(exchanged,0);
  const success=await call(`/google/callback?code=synthetic&state=${state}`,{headers:{Cookie:cookie.split(';')[0]}});
  assert.match(success.headers.get('location'),/login\/callback#token=/);assert.equal(exchanged,1);assert.match(success.headers.get('set-cookie'),/Expires=/);
  const replay=await call(`/google/callback?code=synthetic&state=${state}`,{headers:{Cookie:cookie.split(';')[0]}});assert.match(replay.headers.get('location'),/autenticacion-fallida/);assert.equal(exchanged,1);
  const cancel=await call('/google/callback?error=access_denied');assert.match(cancel.headers.get('location'),/google-cancelado/);
  const forgot=await call('/password/forgot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'synthetic@example.invalid'})});assert.equal(forgot.status,503);
  const change=await call('/password/change',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(change.status,401);
  for(const client of ['192.0.2.1','192.0.2.2','192.0.2.3'])for(let i=0;i<17;i++) {
    const r=await call('/password/forgot',{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':client},body:JSON.stringify({email:'synthetic@example.invalid'})});
    assert.equal(r.status,503,'one client must not exhaust another client recovery quota behind gateway');
  }
 } finally {for(const server of servers.reverse())await new Promise(resolve=>server.close(resolve));}
});
