const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {httpLogger,logger}=require('../api-gateway/dist/middleware/logger');
test('auth request logs never include OAuth query secrets, referrers or request bodies',async t=>{
 const entries=[];t.mock.method(logger,'info',value=>entries.push(value));
 const req=new EventEmitter();Object.assign(req,{method:'GET',url:'/api/auth/google/callback?code=secret-code&state=secret-state',originalUrl:'/api/auth/google/callback?code=secret-code&state=secret-state',path:'/api/auth/google/callback',headers:{referer:'https://host/?secret-referrer'}});
 const res=new EventEmitter();Object.assign(res,{statusCode:302,headersSent:true,getHeader:()=>null});
 httpLogger(req,res,()=>{});res.emit('finish');await new Promise(setImmediate);
 assert.equal(entries.length,1);assert(!entries.join().includes('secret-'));assert(entries.join().includes('/api/auth/google/callback'));
});
