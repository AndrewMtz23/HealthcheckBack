const {test}=require('node:test');
const assert=require('node:assert/strict');
test('audit contract accepts known metadata and rejects secrets, forged classification and inconsistent actors',()=>{
 const {validate,classify}=require('../shared/audit/index.cjs');
 const {valid}=require('../contracts/audit/fixtures.json');
 assert.equal(validate(valid).ok,true);
 for(const patch of [{metadata:{token:'secret'}},{sensitivity:'normal'},{actor_type:'anonymous',user_id:4},{description:'x'.repeat(1001)},{user_agent:'x'.repeat(513)},{action:'UNKNOWN'},{entity:'payment'},{origin:'live',occurred_at:null}])assert.equal(validate({...valid,...patch}).ok,false,JSON.stringify(patch));
 assert.equal(classify('AUTH_LOGIN','failure'),'sensible');
 assert.equal(classify('AUTH_LOGIN','success'),'normal');
 assert.equal(classify('NEWS_PUBLISH','success'),'sensible');
 assert.equal(validate({...valid,origin:'imported',user_id:null}).ok,true);
 assert.equal(validate({...valid,occurred_at:'2026-02-30T00:00:00Z'}).ok,false);
});
test('every catalog action has a fixture and rejects unknown or excessive metadata',()=>{
 const {validate}=require('../shared/audit/index.cjs');
 const catalog=require('../contracts/audit/catalog.json');
 const {events}=require('../contracts/audit/fixtures.json');
 assert.equal(events.length,Object.keys(catalog.actions).length);
 for(const event of events){assert.equal(validate(event).ok,true,event.action);assert.equal(validate({...event,metadata:{password:'hidden'}}).ok,false);}
});
