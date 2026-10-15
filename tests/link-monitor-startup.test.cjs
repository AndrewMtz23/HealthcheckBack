const {test}=require('node:test');const assert=require('node:assert/strict');
test('Go launcher selects a compiled binary and diagnostic mode disables writes',()=>{
 const {launchDefinition}=require('../scripts/link-monitor-run.cjs');
 const d=launchDefinition('C:/app',{PORT:'3005',LINK_MONITOR_INTERNAL_TOKEN:'secret'},true);
 assert.equal(require('node:path').basename(d.exe),process.platform==='win32'?'link-monitor.exe':'link-monitor');assert.equal(d.env.HEALTHCHECK_DIAGNOSTIC,'1');assert.match(d.env.PGOPTIONS,/default_transaction_read_only=on/);assert.equal(d.env.LINK_MONITOR_INTERNAL_TOKEN,'secret');
});
