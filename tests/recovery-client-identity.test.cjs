const {test}=require('node:test'),assert=require('node:assert/strict'),{createHmac}=require('node:crypto');
const {recoveryClient}=require('../services/auth-service/dist/account/clientIdentity');
test('only current gateway-signed identities separate recovery client quotas',()=>{
 const secret='synthetic-shared-gateway-secret',now=Date.now(),ip='192.0.2.10';
 const proof=createHmac('sha256',secret).update(`healthcheck-recovery-client\n${now}\n${ip}`).digest('hex');
 const req={ip:'127.0.0.1',headers:{'x-auth-client-ip':ip,'x-auth-client-time':String(now),'x-auth-client-proof':proof,'x-forwarded-for':'192.0.2.99'}};
 assert.equal(recoveryClient(req,secret),ip);assert.equal(recoveryClient(req,'wrong-secret-value'),'127.0.0.1');
 assert.equal(recoveryClient({...req,headers:{...req.headers,'x-auth-client-ip':'192.0.2.11'}},secret),'127.0.0.1');
 assert.equal(recoveryClient(req,secret,now+31000),'127.0.0.1');
 assert.equal(recoveryClient({...req,headers:{'x-forwarded-for':ip}},secret),'127.0.0.1');
});
