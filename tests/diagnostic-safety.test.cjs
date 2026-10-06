const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const base = path.resolve(__dirname, '../services/notification-service/src');
// Providers and scheduler are external effects: trap attempts without contacting them.
function load(file, dependencies, env={HEALTHCHECK_DIAGNOSTIC:'1'}) {
  const module = {exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(base,file),'utf8'), {
    module, exports:module.exports, process:{env}, console,
    require(name){if(name in dependencies)return dependencies[name]; throw Error('Unexpected dependency '+name);}
  }, {filename:file});
  return module.exports;
}
test('diagnostic email refuses delivery without creating SMTP transport', async()=>{
  const cfg=load('config/email.js', {nodemailer:{createTransport(){throw Error('SMTP initialized');}}});
  await assert.rejects(cfg.transporter.sendMail({}), /disabled/i);
});
test('diagnostic SMS refuses delivery without initializing Twilio', async()=>{
  const cfg=load('config/sms.js', {twilio(){throw Error('Twilio initialized');}});
  await assert.rejects(cfg.client.messages.create({}), /disabled/i);
});
test('diagnostic startup never verifies SMTP or runs scheduler; blocks implicit-write GET', ()=>{
  const middleware=[]; const effects=[];
  const app={use(...a){if(typeof a[0]==='function')middleware.push(a[0]);},get(){},listen(p,fn){fn();}};
  const express=()=>app; express.json=()=>function json(){};
  load('app.js', {dotenv:{config(){}},express,cors:()=>function cors(){},'./config':{emailConfig:{transporter:{verify(){effects.push('smtp');}}}},'./routes':{},'./services/scheduler.service':{processUnsentNotifications(){effects.push('process');},generateFalseNewsNotifications(){effects.push('generate');},startScheduler(){effects.push('cron');}},'./utils/logger':{info(){},error(){}}});
  assert.deepEqual(effects, []);
  for(const [method,url] of [['POST','/api/notifications/notifications/send'],['GET','/api/notifications/preferences/123']]) {
    let blocked=false;
    for(const fn of middleware) fn({method,path:url},{status(code){assert.equal(code,503);return this;},json(){blocked=true;}},()=>{});
    assert.equal(blocked,true,method+' '+url);
  }
});
