const {test}=require('node:test'),assert=require('node:assert/strict');
const {deliveryWindow,retryOutcome}=require('../services/notification-service/src/services/delivery-policy');
test('daily and weekly windows follow Mexico City 09:00, never future slots',()=>{
 assert.equal(deliveryWindow('diaria',new Date('2026-10-09T14:59:00Z')).until.toISOString(),'2026-10-08T15:00:00.000Z');
 assert.equal(deliveryWindow('diaria',new Date('2026-10-09T15:00:00Z')).until.toISOString(),'2026-10-09T15:00:00.000Z');
 assert.equal(deliveryWindow('semanal',new Date('2026-10-12T14:59:00Z')).until.toISOString(),'2026-10-05T15:00:00.000Z');
 assert.equal(deliveryWindow('semanal',new Date('2026-10-12T15:00:00Z')).until.toISOString(),'2026-10-12T15:00:00.000Z');
 assert.equal(deliveryWindow('inmediata',new Date('2026-10-09T15:13:10Z')).until.toISOString(),'2026-10-09T15:00:00.000Z');
 assert.throws(()=>deliveryWindow('invalid',new Date()));
});
test('only definite temporary refusal is retried, ambiguous SMTP is held for reconciliation',()=>{
 assert.equal(retryOutcome({responseCode:451},1).state,'retry');assert.equal(retryOutcome({code:'ECONNREFUSED'},2).delay,3600000);
 assert.equal(retryOutcome({responseCode:451},3).state,'failed');assert.equal(retryOutcome({responseCode:550},1).state,'failed');
 assert.equal(retryOutcome({code:'ETIMEDOUT'},1).state,'uncertain');assert.equal(retryOutcome(Error('unknown'),1).state,'uncertain');
});
