const {test}=require('node:test');const assert=require('node:assert/strict');
const {parseQuery}=require('../services/news-service/dist/admin/query');
test('admin query bounds pagination and rejects impossible dates',()=>{
 assert.throws(()=>parseQuery({startDate:'2026-02-30'}));
 assert.throws(()=>parseQuery({limit:'1000'}));
 assert.throws(()=>parseQuery({startDate:'2026-10-05',endDate:'2026-01-01'}));
 assert.equal(parseQuery({page:'2',limit:'15'}).offset,15);
});
