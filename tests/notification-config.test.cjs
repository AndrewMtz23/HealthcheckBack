const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../services/notification-service/src/config/email'),'utf8');
function load(env){const calls=[],module={exports:{}};vm.runInNewContext(source,{module,exports:module.exports,process:{env},require:()=>({createTransport:options=>{calls.push(options);return {sendMail:async()=>({accepted:[]})};}})});return {...module.exports,calls};}
const settings={NOTIFICATION_DELIVERY_ENABLED:'true',EMAIL_HOST:'smtp.example.invalid',EMAIL_PORT:'587',EMAIL_SECURE:'false',EMAIL_USER:'synthetic@example.invalid',EMAIL_PASS:'synthetic'};
test('delivery is disabled unless opted in with complete settings and never creates diagnostic SMTP transport',async()=>{
 for(const env of [{},{...settings,NOTIFICATION_DELIVERY_ENABLED:'false'},{...settings,HEALTHCHECK_DIAGNOSTIC:'1'},{...settings,NODE_ENV:'test'},{...settings,EMAIL_PASS:''}]){
  const config=load(env);assert.equal(config.enabled,false);assert.equal(config.calls.length,0);await assert.rejects(config.transporter.sendMail({}));
 }
});
test('SMTP booleans are parsed and TLS with strict certificate verification is required',()=>{
 const config=load(settings);assert.equal(config.enabled,true);assert.equal(config.calls[0].secure,false);assert.equal(config.calls[0].requireTLS,true);assert.equal(config.calls[0].tls.rejectUnauthorized,true);assert.equal(config.calls[0].disableUrlAccess,true);assert.equal(config.calls[0].disableFileAccess,true);
});
