const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('starting with SMTP disabled launches the scheduler without opening SMTP',async()=>{
 const actions=[],callbacks=[],module={exports:{}};
 const app={use(){},get(){},listen(_port,callback){callbacks.push(callback);}};
 const express=()=>app;express.json=()=>{};
 vm.runInNewContext(fs.readFileSync(require.resolve('../services/notification-service/src/app'),'utf8'),{module,exports:module.exports,process:{env:{}},require(name){
  if(name==='dotenv')return {config(){}};if(name==='express')return express;if(name==='cors')return ()=>{};
  if(name==='./config')return {emailConfig:{enabled:false,transporter:{verify(){actions.push('SMTP');}}}};
  if(name.includes('routes'))return {};if(name.includes('logger'))return {info(){},error(){}};
  if(name.includes('scheduler'))return {startScheduler(){actions.push('scheduler');},async runOnce(){actions.push('in-app-only-run');}};
  throw Error(name);
 }});
 for(const callback of callbacks)await callback();assert.deepEqual(actions,['scheduler','in-app-only-run']);
});
