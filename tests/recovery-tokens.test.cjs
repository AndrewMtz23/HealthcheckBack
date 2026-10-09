const {test}=require('node:test');
const assert=require('node:assert/strict');
const {RecoveryTokens,RequestLimits,validPassword}=require('../services/auth-service/dist/account/security');
test('recovery is user-bound, single-use, expires and replaces older links',()=>{
 let now=1000;const tokens=new RecoveryTokens(()=>now);
 const a=tokens.issue(1,'hash-a'),b=tokens.issue(2,'hash-b');
 assert.equal(tokens.take(a).userId,1);assert.equal(tokens.take(a),undefined);
 const c=tokens.issue(2,'hash-b');assert.equal(tokens.take(b),undefined);
 now+=15*60*1000;assert.equal(tokens.take(c),undefined);
 assert.equal(tokens.take('invalid'),undefined);
});
test('tokens contain 256 random bits and retain only a digest at rest',()=>{
 const tokens=new RecoveryTokens();const value=tokens.issue(10,'hash');
 assert.match(value,/^[a-f0-9]{64}$/);assert(!JSON.stringify([...tokens.entries]).includes(value));
 tokens.revoke(10);assert.equal(tokens.take(value),undefined);
});
test('bounded request windows recover after expiration and do not accept unlimited identities',()=>{
 let now=0;const limits=new RequestLimits(2,100,2,()=>now);
 assert(limits.allow('a'));assert(limits.allow('a'));assert(!limits.allow('a'));
 assert(limits.allow('b'));assert(!limits.allow('c'));
 now=100;assert(limits.allow('a'));assert(limits.allow('c'));
});
test('new passwords reject short values and bcrypt byte truncation',()=>{
 assert(!validPassword('1234567'));assert(validPassword('Synthetic-pass-123!'));
 assert(!validPassword('é'.repeat(37)));assert(validPassword('é'.repeat(36)));
 assert(!validPassword({}));
});
test('account-wide revocation invalidates recovery links as well as sessions',()=>{
 const {recoveryTokens}=require('../services/auth-service/dist/account/security');
 const {revokeUserSessions}=require('../services/auth-service/dist/utils/sessions');
 const token=recoveryTokens.issue(781,'synthetic-credential');
 revokeUserSessions(781);assert.equal(recoveryTokens.take(token),undefined);
});
