const {test}=require('node:test'),assert=require('node:assert/strict');
test('audit context ignores forged client headers and verifies gateway context without trusting actor headers',()=>{
 const {context,signContext}=require('../shared/audit/runtime.cjs');
 const secret='synthetic-secret-'.repeat(3);
 const req={headers:{'x-forwarded-for':'1.2.3.4','x-user-id':'99'},socket:{remoteAddress:'127.0.0.1'},user:{id:2,rol:'usuario'}};
 assert.equal(context(req,secret).ip_address,'127.0.0.1');
 const headers=signContext({headers:{'user-agent':'Synthetic'},socket:{remoteAddress:'192.0.2.1'}},secret);
 const signed=context({...req,headers},secret);assert.equal(signed.ip_address,'192.0.2.1');assert.equal(signed.user_id,2);
 assert.equal(context({...req,headers:{...headers,'x-audit-ip':'192.0.2.2'}},secret).ip_address,'127.0.0.1');
 assert.equal(signed.user_agent,'Synthetic');
});
