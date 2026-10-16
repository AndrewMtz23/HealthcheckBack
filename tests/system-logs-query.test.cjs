const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseLogQuery}=require('../services/news-service/dist/audit/query');
test('Logs validates filters, defaults fourteen Mexico City days and rejects invalid dates',()=>{
 const q=parseLogQuery({},new Date('2026-10-16T02:00:00Z'));
 assert.equal(q.startDate,'2026-10-02');assert.equal(q.endDate,'2026-10-15');assert.equal(q.limit,25);
 for(const value of [{startDate:'2026-02-30'},{limit:26},{page:-1},{action:'injected'},{q:['a','b']},{startDate:'2026-11-01',endDate:'2026-10-01'}])assert.throws(()=>parseLogQuery(value),e=>e.status===400);
 assert.equal(parseLogQuery({limit:100,q:'  something  '}).q,'something');
});
