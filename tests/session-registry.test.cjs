const {test}=require('node:test');
const assert=require('node:assert/strict');
process.env.JWT_SECRET='synthetic-registry-unit-secret';
const {issueSession,validSession,revokeSession}=require('../services/auth-service/dist/utils/sessions');
test('obsolete credential sessions cannot revoke a newly authenticated device',()=>{
 const user={id:731,activo:true,rol:'usuario',contrasena:'synthetic-hash',google_id:null};
 const old=issueSession(user,60);
 user.google_id='synthetic-google-id';
 const current=issueSession(user,60);
 assert.equal(validSession(current,user),true);
 assert.equal(validSession(old,user),false);
 assert.equal(validSession(current,user),true);
});
test('server registry expires sessions independently and logout leaves another device intact',t=>{
 const user={id:732,activo:true,rol:'admin',contrasena:'synthetic-hash'};
 const a=issueSession(user,60),b=issueSession(user,60);
 revokeSession(a);assert.equal(validSession(a,user),false);assert.equal(validSession(b,user),true);
 const now=Date.now();t.mock.method(Date,'now',()=>now+61000);
 assert.equal(validSession(b,user),false);
});
